import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import crypto from "crypto"
import path from "path";
import fs from "node:fs"
import chalk from "chalk";
import db from "./config/db.js";
import { deployRoutes } from "./routes/deploy.js";

const app = express();

deployRoutes(app);

// 2. Define a route to handle file uploads
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