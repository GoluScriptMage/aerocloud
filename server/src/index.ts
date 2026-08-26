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
import { globalRateLimiter } from "./utils/rateLimiter.js";
import { linkRepo } from "./routes/linkRepo.js";
import { webhookRoutes } from "./routes/webhookRoute.js";

dotenv.config();
const app = express();

// Middlewares to parse JSON and handle file uploads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global rate limiter middleware for all routes
app.use(globalRateLimiter);

// Check for blocked IPs and users
app.use(blockListGuard);

// Public routes (no authentication required)
authRoutes(app);
webhookRoutes(app);

// Global Auth Guard (  applies to all routes below this line) 
app.use(authenticateUserMiddleware);

// Protected routes (authentication required)
deployRoutes(app);
listDeployments(app);
stopContainer(app);
destroyContainer(app);
getCrashLogs(app);
linkRepo(app);

// Start the server
app.listen(3000, () => {
    Logger.info("Server running on port 3000");
})