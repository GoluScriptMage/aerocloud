import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import crypto from "crypto"
import path from "path";
import fs from "node:fs"
import chalk from "chalk";
import db from "./config/db.js";
import { deployRoutes } from "./routes/deploy.js";
import { Logger } from "./utils/logger.js";
import { listDeployments } from "./routes/listDeployments.js";

const app = express();

// Deploy routes 
deployRoutes(app);

// List deployment route
listDeployments(app);

app.listen(3000, () => {
    Logger.info("Server running on port 3000");
})