import path from "node:path";
import fs from "node:fs";
import * as tar from "tar";
import { Readable } from "node:stream";
import docker from "../config/docker.js";
import { ensureDockerFile } from "./createDockerfile.js";
import { findAvailablePort } from "./goPortFinder.js";
import { getSubDomain, saveDeployment, updateDeployment } from "../config/db.js";
import { Logger } from "./logger.js";
import { sanitizeSubDomain } from "./security.js";
import { rollbackDeployment } from "../routes/deploy.js";

export interface DeployFromGitOptions {
    subDomain: string;
    repoFullName: string;
    branch: string;
    decryptedToken: string;
    userId: string;
    envVars?: string;
}

export async function deployFromGitTarball(
    options: DeployFromGitOptions
): Promise<{ port: number; url: string; containerId: string }> {
    const { subDomain, repoFullName, branch, decryptedToken, userId, envVars } = options;

    // 1. Sanitize the subdomain
    sanitizeSubDomain(subDomain);

    const targetDir = path.join(process.cwd(), "deployments", subDomain);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    Logger.info(`[DeployEngine] Fetching tarball for ${repoFullName} at branch ${branch}...`);

    // 2. Fetch tarball stream from GitHub API
    const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/tarball/${branch}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${decryptedToken}`,
            "User-Agent": "AeroCloud-Server",
            Accept: "application/vnd.github.v3+json"
        }
    });

    if (!ghRes.ok || !ghRes.body) {
        throw new Error(`Failed to fetch tarball from GitHub: ${ghRes.status} ${ghRes.statusText}`);
    }

    // 3. Extract tarball stream to target directory (strip outer GitHub root folder)
    const nodeStream = Readable.fromWeb(ghRes.body as any);
    await new Promise<void>((resolve, reject) => {
        nodeStream
            .pipe(tar.extract({ cwd: targetDir, strip: 1 }))
            .on("finish", () => resolve())
            .on("error", (err) => reject(err));
    });

    Logger.success(`[DeployEngine] Extracted source files to ${targetDir}`);

    // 4. Ensure Dockerfile exists (auto-detect Node/Go/Python/Static)
    ensureDockerFile(targetDir);

    const tarStream = tar.c(
        {
            gzip: false,
            cwd: targetDir,
            filter: (filePath) => !filePath.includes("node_modules") && !filePath.includes(".git")
        },
        ["."]
    ) as unknown as NodeJS.ReadableStream;

    const imageName = `aerocloud/${subDomain}:latest`;

    // 5. Pre-allocate an available port for zero-downtime swap
    const dockerPort = await findAvailablePort();
    const existing = getSubDomain(subDomain);
    if (!existing) {
        saveDeployment(subDomain, dockerPort, "deploying", envVars || "{}", userId);
    } else {
        updateDeployment(subDomain, "deploying", "", dockerPort, envVars || "{}", userId);
    }

    // 6. Build Docker Image
    Logger.info(`[DeployEngine] Building Docker image ${imageName}...`);
    const buildStream = await docker.buildImage(tarStream, { t: imageName });

    await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(
            buildStream,
            (err, res) => {
                if (err) return reject(err);
                resolve();
            },
            (event) => {
                if (event.stream) {
                    process.stdout.write(event.stream);
                }
            }
        );
    });

    Logger.success(`[DeployEngine] Docker image ${imageName} built successfully`);

    // 7. Parse EnvVars for container
    const parsedEnv = envVars ? JSON.parse(envVars) : {};
    const envArray = Object.entries(parsedEnv).map(([k, v]) => `${k}=${v}`);

    try {
        // 8. Create and Start the New Container with cgroups limits
        const container = await docker.createContainer({
            Image: imageName,
            name: `aerocloud-${subDomain}-${dockerPort}`,
            Env: envArray,
            ExposedPorts: { "3000/tcp": {}, "8080/tcp": {} },
            HostConfig: {
                Memory: 512 * 1024 * 1024, // 512MB RAM
                MemorySwap: 1024 * 1024 * 1024, // 1GB Swap + Memory
                NanoCpus: 1 * 1e9, // 1 CPU Core
                PortBindings: {
                    "3000/tcp": [{ HostPort: dockerPort.toString() }],
                    "8080/tcp": [{ HostPort: dockerPort.toString() }]
                }
            }
        });

        await container.start();
        Logger.success(`[DeployEngine] Container started successfully for ${subDomain} on port ${dockerPort}`);

        // 9. Update SQLite deployment record
        updateDeployment(subDomain, "deployed", container.id, dockerPort, envVars || "{}", userId);

        // 10. Clean up old container (Zero-Downtime Swap)
        if (existing && (existing as any).containerId) {
            const oldId = (existing as any).containerId;
            try {
                const oldCont = docker.getContainer(oldId);
                await oldCont.stop({ t: 2 });
                await oldCont.remove({ force: true });
                Logger.info(`[DeployEngine] Successfully cleaned up old container ${oldId.substring(0, 12)}`);
            } catch (err) {
                Logger.warn(`[DeployEngine] Could not remove old container: ${(err as Error).message}`);
            }
        }

        return {
            port: dockerPort,
            url: `http://${subDomain}.localhost:8080`,
            containerId: container.id
        };
    } catch (containerErr) {
        Logger.error(`[DeployEngine] Container startup failed: ${(containerErr as Error).message}`);
        rollbackDeployment(targetDir, subDomain, userId);
        throw containerErr;
    }
}