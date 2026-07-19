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
// file is name defined in index.ts(cli) & multer finds for file parse and save in req.file
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

app.get("/list", (req, res) => {

    const dirPath = path.join(process.cwd(), 'deployments');

    // 1. Read the folder & get only folders { name, deployedAt }
    const dirs = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map((d) => ({
            subDomain: d.name,
            deployedAt: fs.statSync(path.join(dirPath, d.name)).birthtime
        }))

    res.status(200).json(dirs)
})

app.listen(3000, () => {
    console.log("Server running on port 3000");
})