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
import { destroyContainer, stopContainer } from "./routes/stopContainer.js";
import { getCrashLogs } from "./routes/logs.js";
import { authRoutes } from "./routes/auth.js";
import dotenv from "dotenv";
import { authenticateUserMiddleware } from "./utils/middleware.js";
import { blockListGuard } from "./utils/blockListGuard.js";

dotenv.config();
const app = express();

// Middlewares to parse JSON and handle file uploads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Check for blocked IPs and users
app.use(blockListGuard);

// Public routes (no authentication required)
authRoutes(app);

// Global Auth Guard (  applies to all routes below this line) 
app.use(authenticateUserMiddleware);

// Protected routes (authentication required)
deployRoutes(app); // Handles deployment of applications

listDeployments(app); // Lists all deployments for the authenticated user

stopContainer(app); // Stops a specific container for the authenticated user

destroyContainer(app); // Destroys a specific container for the authenticated user

getCrashLogs(app); // Retrieves crash logs for a specific container for the authenticated user

// Start the server
app.listen(3000, () => {
    Logger.info("Server running on port 3000");
})