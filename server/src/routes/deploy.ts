import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "node:fs";
import AdmZip from "adm-zip";
import chalk from "chalk";
import express from "express";

export function deployRoutes(app: express.Express) {

    // 1. Configure multer storage
    const storage = multer.memoryStorage(); // Store files in memory for processing
    const upload = multer({ storage: storage });

    // 2. Define a route to handle file uploads
    // file is name defined in index.ts(cli) & multer finds for file parse and save in req.file
    app.post("/deploy", upload.single("file"), (req, res) => {
        console.log(chalk.yellowBright.italic("Received a deployment request"));

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
        return res.status(200).json({ message: "file uploaded and extracted successfully", subDomain: subDomain });
    });
}
