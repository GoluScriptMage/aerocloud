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

export function rollbackDeployment(targetDir: string, subDomain: string, userId: string) {

    try {
        deleteDeployment(subDomain, userId);
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

        try {
            const user = (req as any).user;

            // Check if a file exists
            const file = (req as any).file;
            const envVars = req.body.envVars; // Get envVars from the request body
            Logger.debug(`Received deployment request from user: ${user?.githubId}, subdomain: ${req.body.name}, envVars: ${envVars}`);

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
            const parsedEnv = envVars && JSON.stringify(dotenv.parse(envVars));
            Logger.debug(`Parsed environment variables: ${parsedEnv}: ${envVars}`);

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
                const dockerPort = await findAvailablePort();
                updateDeployment(subDomain, "deploying", "", dockerPort, "", user?.githubId);

                // Build docker image
                docker.buildImage(tarStream, { t: imageName }, async (err, stream) => {
                    if (err || !stream) {
                        const errorMsg = err ? err.message : "Docker build stream is null.";
                        Logger.error(`Docker build initiation failed: ${errorMsg}`);
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

                            // 5.2 Modify the env vars to be in the format expected by Docker
                            const modifiedEnvVars = envVars ? Object.entries(JSON.parse(envVars.envVars || "{}")).map(([key, value]) => `${key}=${value}`).join('\n') : undefined;
                            const containerName = `${subDomain}-${crypto.randomBytes(3).toString('hex')}`; // Unique container name to avoid conflicts
                            const portBindings = { "3000/tcp": [{ HostPort: dockerPort.toString() }] };

                            const container = await docker.createContainer({
                                Image: imageName,
                                name: containerName,
                                Env: modifiedEnvVars ? modifiedEnvVars.split('\n') : undefined, // insersts the env vars into the container
                                ExposedPorts: { "3000/tcp": {} },
                                HostConfig: {
                                    Memory: 512 * 1024 * 1024, // 512MB
                                    MemorySwap: 1024 * 1024 * 1024, // 1GB (disk swap + memory)
                                    NanoCpus: 1 * 1e9, // 1 CPU
                                    PortBindings: portBindings
                                }
                            });

                            Logger.info(`Container started successfully for deployment: ${subDomain} on port ${dockerPort}`);
                            await container.start();

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
            rollbackDeployment(targetDir, req.body.name, (req as any).user?.githubId);
            return res.status(500).json({ type: "result", status: "failed", message: `Deployment failed: ${(error as Error).message}` });
        }
    });
}
