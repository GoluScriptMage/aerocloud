import dotenv from "dotenv";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "node:fs";
import AdmZip from "adm-zip";
import express from "express";
import { deleteDeployment, getDeployment, getSubDomain, saveProject, updateDeployment } from "../config/db.js";
import * as tar from 'tar';
import docker from "../config/docker.js";
import { ensureDockerFile } from "../utils/createDockerfile.js";
import { saveDeployment } from "../config/db.js";
import { findAvailablePort } from "../utils/goPortFinder.js";
import { Logger } from "../utils/logger.js";
import { checkZipForSecurity, sanitizeSubDomain } from "../utils/security.js";
import { deployRateLimiter } from "../utils/rateLimiter.js";
import { leasePort, releasePort } from "../utils/daemonClient.js";
import { getExposedPort, normalizeEnv, formatEnvForDocker } from "../utils/helper.js";
import { encryptAccessToken, decryptAccessToken } from "../utils/security.js";

export function rollbackDeployment(targetDir: string, subDomain: string, userId: string) {

    try {
        // Delete the deployment record from the database 
        deleteDeployment(subDomain, userId);

        fetch(`http://localhost:8081/routes/${subDomain}`, {
            'method': "DELETE",
            'headers': {
                'Content-Type': 'application/json'
            }
        }).then((response) => {
            if (!response.ok) {
                Logger.warn(`Failed to remove route for subdomain ${subDomain} from proxy server: ${response.status} ${response.statusText}`);
            } else {
                Logger.info(`Route for subdomain ${subDomain} removed from proxy server.`);
            }
        }).catch((err) => {
            Logger.error(`Error while removing route for subdomain ${subDomain} from proxy server: ${(err as Error).message}`);
        });

        if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
            Logger.info(`Rollback successful: Deployment ${subDomain} removed and directory ${targetDir} deleted.`);
        } else {
            Logger.warn(`Rollback warning: Directory ${targetDir} does not exist.`);
        }
    } catch (error) {
        Logger.error(`Rollback failed for deployment ${subDomain}: ${(error as Error).message}`);
    }
}

export function deployRoutes(app: express.Express) {

    // 1. Configure multer storage
    const storage = multer.memoryStorage(); // Store files in memory for processing
    const upload = multer({ storage: storage, limits: { fileSize: 25 * 1024 * 1024 } }); // Limit file size to 25MB

    // 2. Define a route to handle file uploads
    app.post("/deploy", deployRateLimiter, upload.single("file"), async (req, res) => {
        let targetDir = '';
        let dockerPort: number = 0; // Initialize dockerPort here to ensure it's defined in the catch block

        try {
            const user = (req as any).user;

            // Check if a file exists
            const file = (req as any).file;
            const envVars = (req as any).body.envVars; // Get envVars from the request body

            if (!file) {
                return res.status(400).send("No file uploaded.");
            }

            const fileName = req.body.name;

            // 1. Create sub-Domain & targetDir
            const subDomain = req.body.name && req.body.name.trim() !== '' ? req.body.name : `app-${crypto.randomBytes(3).toString('hex')}`;
            targetDir = path.join(process.cwd(), 'deployments', subDomain);
            saveProject(subDomain, null, user?.githubId, 'main', envVars || "");

            // ** Important **
            // 1.1 Sanitize the subdomain to ensure 
            sanitizeSubDomain(subDomain);

            // 1.2 Check if the deployment already exists for this user
            const existing = getSubDomain(subDomain);
            if (existing) {
                return res.status(409).json({
                    type: "result",
                    status: "failed",
                    message: `Deployment with subdomain '${req.body.name}' already exists. Please choose a different name.`
                });
            }

            // 2. Extract zip to target Dir
            const fileBuffer = file.buffer;
            const zip = new AdmZip(fileBuffer);

            // IMPORTANT: CHECK ZIP FOR SECURITY VULNERABILITIES (e.g., Zip Slip)
            const zipEntried = zip.getEntries();
            checkZipForSecurity(zipEntried, 100, targetDir); // 100 MB limit

            // 3. Create dir on targetDir
            fs.mkdirSync(targetDir, { recursive: true });

            zip.extractAllTo(targetDir, true);

            // 3.1 Check for .env file 
            const parsedEnv = normalizeEnv(envVars);
            Logger.info(`Parsed environment variables for deployment ${subDomain}: ${parsedEnv}`);
            // 4. Save deployment in db with status "deploying" 
            // Save the env vars 
            saveDeployment(subDomain, 0, "deploying", parsedEnv || "", user?.githubId);

            if (fs.existsSync(path.join(targetDir, 'package.json'))) {
                ensureDockerFile(targetDir);

                const tarStream = tar.c(
                    {
                        gzip: false,
                        cwd: targetDir,
                        filter: (filePath) => !filePath.includes('node_modules')
                    }, ['.']) as unknown as NodeJS.ReadableStream;

                const imageName = `aerocloud/${subDomain}:latest`;

                // Set streaming headers before starting the docker build process
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.setHeader("Transfer-Encoding", "chunked");

                // Get the port and claim it for the deployment to avoid race conditions
                dockerPort = await leasePort();
                updateDeployment(subDomain, "deploying", "", dockerPort, "", user?.githubId);

                // Build docker image
                docker.buildImage(tarStream, { t: imageName }, async (err, stream) => {
                    if (err || !stream) {
                        const errorMsg = err ? err.message : "Docker build stream is null.";
                        Logger.error(`Docker build initiation failed: ${errorMsg}`);
                        await releasePort(dockerPort);
                        await rollbackDeployment(targetDir, subDomain, user?.githubId);
                        res.status(500).write(JSON.stringify({
                            type: "result",
                            status: "failed",
                            message: `Docker build initiation failed: ${errorMsg}`
                        }) + "\n");
                        res.end();
                        return;
                    }

                    // Follow the progress of the Docker build
                    docker.modem.followProgress(stream, async (onFinished, output) => {
                        // Check if the build process finished with an error
                        if (onFinished) {
                            Logger.error('Docker image build failed');
                            await rollbackDeployment(targetDir, subDomain, user?.githubId);
                            await releasePort(dockerPort);
                            res.status(500).write(JSON.stringify({
                                type: "result",
                                status: "failed",
                                message: "Docker image build failed."
                            }) + "\n");
                            res.end();
                            return;
                        }

                        try {
                            Logger.info(`Docker image built successfully: ${imageName}`);

                            // 5.1 Get the env vars from the database for this deployment
                            const envVars = await getDeployment(subDomain, user?.githubId) as { envVars?: string } | undefined;
                            const decryptedEnvVars = envVars?.envVars && envVars.envVars.includes(':') ? decryptAccessToken(envVars.envVars) : envVars?.envVars || "";

                            // 5.2 Modify the env vars to be in the format expected by Docker
                            const containerName = `${subDomain}-${crypto.randomBytes(3).toString('hex')}`; // Unique container name to avoid conflicts

                            const exposedPorts = `${getExposedPort(targetDir)}/tcp`; // Port that is exposed inside the container (running server port)
                            Logger.debug(`Exposed ports for container: ${exposedPorts}`);
                            const portBindings = { [exposedPorts]: [{ HostPort: dockerPort.toString() }] }; // Binding of host port -> running server port 

                            const container = await docker.createContainer({
                                Image: imageName,
                                name: containerName,
                                Env: formatEnvForDocker(decryptedEnvVars), // insersts the env vars into the container
                                ExposedPorts: { [exposedPorts]: {} },
                                HostConfig: {
                                    Memory: 512 * 1024 * 1024, // 512MB
                                    MemorySwap: 1024 * 1024 * 1024, // 1GB (disk swap + memory)
                                    NanoCpus: 1 * 1e9, // 1 CPU
                                    PortBindings: portBindings,


                                    // New Soverign Sandboxing
                                    NetworkMode: "aerocloud-net", // Dedicated Network mode
                                    ReadonlyRootfs: true, // Read-only root filled 
                                    Tmpfs: {
                                        "/tmp": "rw,noexec,nosuid,size=64m" // temporary file system(tmpfs)
                                    }
                                }
                            });

                            await container.start();
                            Logger.info(`Container started successfully for deployment: ${subDomain} on port ${dockerPort}`);

                            /**
                             * Important FALLBACK: IF container crashed after starting, rollback the deployment for the user
                             */

                            // 1.5 sec wait to ensure contianer is up
                            await new Promise((resolve, reject) => setTimeout(resolve, 1500))
                            const inspectData = await container.inspect();

                            // Check if the container is running
                            if (!inspectData.State.Running) {
                                Logger.error(`Container for deployment ${subDomain} is not running. Rolling back deployment.`);
                                const exitCode = inspectData.State.ExitCode;
                                let crashLogs = "NO Log output recorded";

                                try {
                                    const logsStream = await container.logs({ stdout: true, stderr: true, tail: 100 });
                                    crashLogs = logsStream.toString('utf-8').trim();
                                } catch { }

                                // Rollback the deployment
                                rollbackDeployment(targetDir, subDomain, user?.githubId);

                                // Send a 500 response with the crash logs
                                res.status(500).write(JSON.stringify({
                                    type: "result",
                                    status: "failed",
                                    message: `Container for deployment ${subDomain} crashed after starting. Exit code: ${exitCode}. Logs: ${(crashLogs)}`
                                }) + "\n");
                                res.end();
                                return;
                            }
                            // 8. Add the route to the proxy server
                            try {
                                const response = await fetch(`http://localhost:8081/routes`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        subDomain: subDomain,
                                        port: dockerPort
                                    })
                                });

                                if (!response.ok) {
                                    throw new Error(`Failed to add route to proxy: ${response.status} ${response.statusText}`);
                                }
                                Logger.info(`Route for subdomain ${subDomain} added to proxy server.`);
                            } catch (err) {
                                Logger.warn(`Failed to add route to proxy server: ${(err as Error).message}`);
                            }

                            updateDeployment(subDomain, "deployed", container.id, dockerPort, envVars?.envVars, user?.githubId);

                            res.status(200).write(JSON.stringify({
                                type: "result",
                                status: "success",
                                subDomain: subDomain,
                                imageName: imageName
                            }) + "\n");
                            res.end();
                            return;
                        } catch (containerErr) {
                            Logger.error(`Container creation/start failed: ${containerErr}`);
                            await releasePort(dockerPort);
                            rollbackDeployment(targetDir, subDomain, user?.githubId);
                            // If headers have not been sent yet, send a 500 response. Otherwise, just write the error message and end the response.
                            if (!res.headersSent) {
                                res.status(500).write(JSON.stringify({
                                    type: "result",
                                    status: "failed",
                                    message: "Failed to start the deployed container."
                                }) + "\n");
                            } else {
                                res.write(JSON.stringify({
                                    type: "result",
                                    status: "failed",
                                    message: "Failed to start the deployed container."
                                }) + "\n");
                                res.end();
                            }
                            return;
                        }
                    }, (event) => {
                        if (event.stream) {
                            res.write(JSON.stringify({ type: "docker_build_output", message: event.stream }) + "\n");
                            process.stdout.write(event.stream);
                        }
                    });

                });
            } else {
                return res.status(200).json({ type: "result", status: "success", message: "file uploaded and extracted successfully", subDomain: subDomain });
            }

        } catch (error) {
            Logger.error(`Deployment failed: ${(error as Error).message}`);
            await releasePort(dockerPort);
            rollbackDeployment(targetDir, req.body.name, (req as any).user?.githubId);
            return res.status(500).json({ type: "result", status: "failed", message: `Deployment failed: ${(error as Error).message}` });
        }
    });
}
