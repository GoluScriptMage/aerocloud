import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "node:fs";
import AdmZip from "adm-zip";
import chalk from "chalk";
import express from "express";
import { getDeployment } from "../config/db.js";
import * as tar from 'tar';
import docker from "../config/docker.js";
import { ensureDockerFile } from "../utils/createDockerfile.js";

export function deployRoutes(app: express.Express) {

    // 1. Configure multer storage
    const storage = multer.memoryStorage(); // Store files in memory for processing
    const upload = multer({ storage: storage });

    // 2. Define a route to handle file uploads
    // file is name defined in index.ts(cli) & multer finds for file parse and save in req.file
    app.post("/deploy", upload.single("file"), (req, res) => {
        console.log(chalk.yellowBright.italic("Received a deployment request"));

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

        // 1. Create sub-Domain & create outputDirPath
        const subDomain = fileName || crypto.randomBytes(3).toString('hex'); // returns (.e.g 1a2bc3)
        const targetDir = path.join(process.cwd(), 'deployments', subDomain);
        console.log((`Deploying to subdomain: ${chalk.bold(subDomain)}`));

        // 2. Create dir on targetDir
        fs.mkdirSync(targetDir, { recursive: true });

        // 3. Create file buffer and AdmZip and extract to target Dir
        const fileBuffer = file.buffer;
        const zip = new AdmZip(fileBuffer);

        zip.extractAllTo(targetDir, true);

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

            const imageName = `aerocloud/${subDomain}:latest`

            docker.buildImage(tarStream, { t: imageName }, (err, stream) => {
                if (err) {
                    console.error('Docker build intiation failed:', err);
                    return res.status(500).json({
                        code: "DOCKER_BUILD_FAILED",
                        message: "Docker build initiation failed. Please check the server logs for more details."
                    })
                }

                docker.modem.followProgress(stream, (onFinished, ouput) => {
                    if (onFinished) {
                        console.log('Docker image build failed')
                        return;
                    }
                    console.log(`Successfully built the docker image`);
                }, (event) => {
                    // Log the output of the Docker build process to the console
                    if (event.stream) {
                        process.stdout.write(event.stream);
                    }
                })

                console.log(chalk.green.italic(`Docker image built successfully: ${imageName}`));

                return res.status(200).json({
                    message: "file uploaded and extracted successfully, docker image built",
                    subDomain: subDomain,
                    imageName: imageName
                })
            },)
        } else {
            return res.status(200).json({ message: "file uploaded and extracted successfully", subDomain: subDomain });
        }

    });
}
