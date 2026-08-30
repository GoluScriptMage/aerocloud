import express from "express";
import path from "node:path";
import fs from "node:fs";
import { Logger } from "../utils/logger.js";
import { getDeployment, updateDeployment, deleteDeployment } from "../config/db.js";
import docker from "../config/docker.js";

export function stopContainer(app: express.Express) {

    app.get("/stop/:subdomain", async (req, res) => {
        const subdomain = req.params.subdomain;
        const user = (req as any).user;

        // 1. Validate subdomain
        if (!subdomain) {
            return res.status(400).json({ error: "Subdomain is required." });
        }
        try {
            // 2. Get containerId from database based on subdomain
            const deployment = getDeployment(subdomain, user.githubId) as any;    
            if (!deployment) {
                return res.status(404).json({ error: "Deployment not found." });
            }

            const containerId = deployment.containerId;
            if (!containerId) {
                return res.status(400).json({ error: "No container associated with this deployment." });
            }

            // 3. Stop the Docker container
            const container = docker.getContainer(containerId);
            await container.stop().catch(() => {});

            // 4. Update the deployment status in the database preserving port & envVars
            updateDeployment(subdomain, "stopped", containerId, deployment.port, deployment.envVars, user.githubId);

            Logger.info(`Container for subdomain ${subdomain} stopped successfully.`);
            return res.status(200).json({ message: "Container stopped successfully." });
        } catch (error) {
            Logger.error(`Error stopping container for subdomain ${subdomain}: ${(error as Error).message}`);
            return res.status(500).json({ error: "Failed to stop the container." });
        }
    });

}

export function destroyContainer(app: express.Express) {

    app.get("/destroy/:subdomain", async (req, res) => {
        const subdomain = req.params.subdomain;
        Logger.debug(`Received request to destroy container for subdomain: ${subdomain}`);
        const user = (req as any).user; 

        // 1. Validate subdomain
        if (!subdomain) {
            return res.status(400).json({ error: "Subdomain is required." });
        }
        try {
            // 2. Get deployment from database based on subdomain
            const deployment = getDeployment(subdomain, user.githubId) as any;
            if (!deployment) {
                return res.status(404).json({ error: "Deployment not found." });
            }

            const containerId = deployment.containerId;
            if (containerId) {
                // 3. Stop and remove container from docker
                try {
                    const container = docker.getContainer(containerId);
                    await container.remove({ force: true });
                    Logger.info(`Container ${containerId.substring(0, 12)} removed.`);
                } catch (e) {
                    Logger.warn(`Notice removing container: ${(e as Error).message}`);
                }
            }

            // 4. Clean up Docker Image
            const imageName = `aerocloud/${subdomain}:latest`;
            try {
                const image = docker.getImage(imageName);
                await image.remove({ force: true });
                Logger.info(`Docker image ${imageName} removed.`);
            } catch (e) {
                Logger.debug(`Notice removing image ${imageName}: ${(e as Error).message}`);
            }

            // 5. Clean up host filesystem deployment directory
            const targetDir = path.join(process.cwd(), "deployments", subdomain);
            if (fs.existsSync(targetDir)) {
                fs.rmSync(targetDir, { recursive: true, force: true });
                Logger.info(`Deployment directory ${targetDir} deleted.`);
            }

            // 6. Delete deployment from SQLite database
            deleteDeployment(subdomain, user.githubId);
            Logger.info(`Deployment for ${subdomain} destroyed and cleared from database.`);

            return res.status(200).json({ message: "Container, image, and files destroyed successfully." });
        } catch (error) {
            Logger.error(`Error destroying container for subdomain ${subdomain}: ${(error as Error).message}`);
            return res.status(500).json({ error: "Failed to destroy the container." });
        }

    });
}