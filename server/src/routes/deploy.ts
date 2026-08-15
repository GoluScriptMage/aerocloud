import dotenv from "dotenv";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "node:fs";
import AdmZip from "adm-zip";
import express from "express";
import { getDeployment, updateDeployment } from "../config/db.js";
import * as tar from 'tar';
import docker from "../config/docker.js";
import { ensureDockerFile } from "../utils/createDockerfile.js";
import { saveDeployment } from "../config/db.js";
import { findAvailablePort } from "../utils/goPortFinder.js";
import { Logger } from "../utils/logger.js";

export function deployRoutes(app: express.Express) {

    // 1. Configure multer storage
    const storage = multer.memoryStorage(); // Store files in memory for processing
    const upload = multer({ storage: storage });

    // 2. Define a route to handle file uploads
    app.post("/deploy", upload.single("file"), (req, res) => {
        Logger.info("Received a deployment request");
        const user = (req as any).user;
        Logger.info(`Authenticated user: ${user?.username} (${user?.githubId})`);

        /**
         * Check for subdomain if already exists in db
         */
        const data = getDeployment(req.body.name, user?.githubId);
        if (data) {
            return res.status(409).json({
                "error": "Conflict",
                "message": "A deployment with the name 'production-frontend' already exists.",
                "code": "DEPLOYMENT_NAME_TAKEN",
            });
        }

        // Check if a file exists
        const file = (req as any).file;
        if (!file) {
            return res.status(400).send("No file uploaded.");
        }

        const fileName = req.body.name;

        // 1. Create sub-Domain & targetDir
        const subDomain = fileName || crypto.randomBytes(3).toString('hex');
        const targetDir = path.join(process.cwd(), 'deployments', subDomain);

        // 2. Create dir on targetDir
        fs.mkdirSync(targetDir, { recursive: true });

        // 3. Extract zip to target Dir
        const fileBuffer = file.buffer;
        const zip = new AdmZip(fileBuffer);
        zip.extractAllTo(targetDir, true);

        // 3.1 Check for .env file 
        const envFilePath = path.join(targetDir, '.env');
        let envFileBuffer: Buffer | null = null;

        // 3.2 Read the .env file if it exists
        if (fs.existsSync(envFilePath)) {
            Logger.info(`.env file found at ${envFilePath}`);
            envFileBuffer = fs.readFileSync(envFilePath);
        } else {
            Logger.warn(`No .env file found in the deployment package.`);
        }

        // 3.3 Parse the .env file if it exists
        const parsedEnv = envFileBuffer && JSON.stringify(dotenv.parse(envFileBuffer));

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
                        const dockerPort = await findAvailablePort();

                        // 5.1 Get the env vars from the database for this deployment
                        const envVars = await getDeployment(subDomain, user?.githubId) as { envVars?: string } | undefined;

                        // 5.2 Modify the env vars to be in the format expected by Docker
                        const modifiedEnvVars = envVars ? Object.entries(JSON.parse(envVars.envVars || "{}")).map(([key, value]) => `${key}=${value}`).join('\n') : undefined;

                        const container = await docker.createContainer({
                            Image: imageName,
                            name: subDomain,
                            Env: modifiedEnvVars ? modifiedEnvVars.split('\n') : undefined, // insersts the env vars into the container
                            ExposedPorts: { "3000/tcp": {} },
                            HostConfig: {
                                PortBindings: { "3000/tcp": [{ HostPort: dockerPort.toString() }] }
                            }
                        });

                        Logger.info(`Container started successfully for deployment: ${subDomain} on port ${dockerPort}`);
                        await container.start();
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
                        updateDeployment(subDomain, "failed", "", 0, "", user?.githubId);
                        res.status(500).write(JSON.stringify({
                            type: "result",
                            status: "failed",
                            message: "Failed to start the deployed container."
                        }) + "\n");
                        res.end();
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

    });
}
