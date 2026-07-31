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
    // file is name defined in index.ts(cli) & multer finds for file parse and save in req.file
    app.post("/deploy", upload.single("file"), (req, res) => {
        Logger.info("Received a deployment request");

        /**
         * Important: Check for subdomain if already exists in db
         */
        const data = getDeployment(req.body.name);
        if (data) {
            return res.status(409).json({
                "error": "Conflict",
                "message": "A deployment with the name 'production-frontend' already exists.",
                "code": "DEPLOYMENT_NAME_TAKEN",
            })
        }

        // Check if a file exists
        const file = (req as any).file;
        if (!file) {
            return res.status(400).send("No file uploaded.");
        }

        const fileName = req.body.name;
        const zipName = fileName ? `${fileName}-test.zip` : "test.zip";

        // 1. Create sub-Domain & create outputDirPath
        const subDomain = fileName || crypto.randomBytes(3).toString('hex'); // returns (.e.g 1a2bc3)
        const targetDir = path.join(process.cwd(), 'deployments', subDomain);

        // 2. Create dir on targetDir
        fs.mkdirSync(targetDir, { recursive: true });

        // 3. Create file buffer and AdmZip and extract to target Dir
        const fileBuffer = file.buffer;
        const zip = new AdmZip(fileBuffer);

        zip.extractAllTo(targetDir, true);

        // 4. Save deployment in db with status "deploying"
        saveDeployment(subDomain, 0, "deploying")

        /**
         * Important: If the uploaded project has package.json file, We will build and run using docker.
         * No static serving is done here.
         */

        if (fs.existsSync(path.join(targetDir, 'package.json'))) {

            ensureDockerFile(targetDir); // Ensure DockerFile exists in the targetDir

            // Create a tar stream of the targetDir excluding node_modules.
            // tar.c returns a tar.Pack which isn't recognized by the docker types as a ReadableStream,
            // so cast it to a compatible stream type.
            const tarStream = tar.c(
                {
                    gzip: false, // No compression, as Docker will handle it
                    cwd: targetDir, // Current working directory for the tar command
                    filter: (path) => !path.includes('node_modules') // Exclude node_modules from the tarball
                }, ['.']) as unknown as NodeJS.ReadableStream; // cast to satisfy docker buildImage type

            const imageName = `aerocloud/${subDomain}:latest` // Image Name

            /**
             * Main Docker Build Process: 
             */
            
            // 1. Build the docker image from the tar stream
            docker.buildImage(tarStream, { t: imageName }, async (err, stream) => {
                // Handle the completion of the Docker build process
                if (err) {
                    Logger.error(`Docker build intiation failed: ${err.message}`);
                    return res.status(500).json({
                        code: "DOCKER_BUILD_FAILED",
                        message: "Docker build initiation failed. Please check the server logs for more details."
                    })
                }
                if (!stream) {
                    Logger.error('Docker build stream is null. Please check the server logs for more details.');
                    return res.status(500).json({
                        code: "DOCKER_BUILD_FAILED",
                        message: "Docker build stream is null. Please check the server logs for more details."
                    })
                }

                // 2. Follow the progress of the Docker build process
                docker.modem.followProgress(stream, async (onFinished, ouput) => {
                    if (onFinished) {
                        Logger.error('Docker image build failed');
                        return;
                    }

                    // 3. Docker image built successfully, now find an available port and create a container
                    Logger.info(`Docker image built successfully: ${imageName}`);
                    const dockerPort = await findAvailablePort(); // Find an available port for the Docker container

                    // 4. Create docker container
                    const container = await docker.createContainer({
                        Image: imageName,
                        ExposedPorts: {
                            "3000/tcp": {}  // Expose port 3000 for the container
                        },
                        HostConfig: {
                            PortBindings: {
                                "3000/tcp": [{
                                    HostPort: dockerPort.toString()  // Bind the container's port 3000 to the available host port
                                }]
                            }
                        }
                    });

                    // 5. Start the container and update the deployment status in the database
                    await container.start(); // Start the container
                    updateDeployment(subDomain, "deployed", container.id, dockerPort); // Update the deployment status and container ID in the database

                    return res.status(200).json({
                        message: "file uploaded and extracted successfully, docker image built",
                        subDomain: subDomain,
                        imageName: imageName
                    })
                }, (event) => {
                    // Log the output of the Docker build process to the console
                    if (event.stream) {
                        process.stdout.write(event.stream);
                    }
                })

            },)
        } else {
            // If no package.json is found, simply return a success response after extraction
            return res.status(200).json({ message: "file uploaded and extracted successfully", subDomain: subDomain });
        }

    });
}
