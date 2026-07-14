import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import crypto from "crypto"
import path from "path";
import fs from "node:fs"
import chalk from "chalk";

const app = express();

// 1. Configure multer storage
const storage = multer.memoryStorage(); // Store files in memory for processing
const upload = multer({ storage: storage });

// 2. Define a route to handle file uploads
app.post("/deploy", upload.single("file"), (req, res) => {

    // Check if a file exists
    const file = (req as any).file;
    if (!file) {
        return res.status(400).send("No file uploaded.");
    }

    // 1. Create sub-Domain & create outputDirPath
    const subDomain = crypto.randomBytes(3).toString('hex'); // returns (.e.g 1a2bc3)
    const targetDir = path.join(process.cwd(), 'deployments', subDomain);

    // 2. Create dir on targetDir
    fs.mkdirSync(targetDir, { recursive: true });

    // 3. Create file buffer and AdmZip and extract to target Dir
    const fileBuffer = file.buffer;
    const zip = new AdmZip(fileBuffer);
    zip.extractAllTo(targetDir, true);
    console.log(chalk.green.italic("Extraction Completed"));
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
})