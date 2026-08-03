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

        /**
         * Check for subdomain if already exists in db
         */
        const data = getDeployment(req.body.name);
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

        // 4. Save deployment in db with status "deploying"
        saveDeployment(subDomain, 0, "deploying");

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

                docker.modem.followProgress(stream, async (onFinished, output) => {
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

                        const container = await docker.createContainer({
                            Image: imageName,
                            ExposedPorts: { "3000/tcp": {} },
                            HostConfig: {
                                PortBindings: { "3000/tcp": [{ HostPort: dockerPort.toString() }] }
                            }
                        });

                        await container.start();
                        updateDeployment(subDomain, "deployed", container.id, dockerPort);

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
                        updateDeployment(subDomain, "failed", "", 0);
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
