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
import { ensureNetworkMode } from "./utils/helper.js";
import docker from "./config/docker.js";

dotenv.config();
const app = express();

// Trust reverse proxy (ngrok, reverse proxy, load balancer)
app.set("trust proxy", 1);

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

// Function for runnnig checks for server 
async function runPreflight() {
    // Check if docker is running
    try {
        const dockerRes = await docker.ping();
        if (!dockerRes) {
            throw new Error(`Docker ping failed. Please ensure Docker is running.`);
        }
        Logger.system("Docker daemon is running and reachable.");
    } catch (error) {
        throw new Error(`Docker is not running or not reachable. Please ensure Docker is installed and running. Error: ${(error as Error).message}`);
    }


    if (!fs.existsSync("/tmp/aerocloud.sock")) {
        Logger.warn(`Aerocloud socket not found at /tmp/aerocloud.sock. Port leasing will fail until daemon starts.`);
    } else {
        Logger.system(`Aerocloud socket found at /tmp/aerocloud.sock.`);
    }
    // Check if Proxy server running
    try {
        await fetch("http://127.0.0.1:8081");
        Logger.system(`Proxy server (:8081) is running and reachable.`);
    } catch (error) {
        Logger.warn(`Proxy server (:8081) is not reachable: ${(error as Error).message}`);
    }
}

const PORT = process.env.SERVER_PORT || 3000;

runPreflight().then(async () => {
    await ensureNetworkMode();
    app.listen(PORT, () => {
        Logger.system("Server running on port " + PORT);
    });
}).catch((err) => {
    Logger.error(`Preflight checks failed: ${(err as Error).message}`);
    process.exit(1);
});