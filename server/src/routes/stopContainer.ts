import express from "express";
import { Logger } from "../utils/logger.js";
import { getDeployment, updateDeployment } from "../config/db.js";
import docker from "../config/docker.js";

export function stopContainer(app: express.Express) {

    app.get("/stop:subdomain", async (req, res) => {
        const subdomain = req.params.subdomain;

        // 1. Validate subdomain
        if (!subdomain) {
            return res.status(400).json({ error: "Subdomain is required." });
        }
        try {
            // 2. Get containerId from database based on subdomain
            const deployment = getDeployment(subdomain);
            if (!deployment) {
                return res.status(404).json({ error: "Deployment not found." });
            }

            const containerId = (deployment as { containerId?: string }).containerId;
            if (!containerId) {
                return res.status(400).json({ error: "No container associated with this deployment." });
            }

            // 3. Stop the Docker container
            const container = docker.getContainer(containerId);
            await container.stop();

            // 4. Update the deployment status in the database
            updateDeployment(subdomain, "stopped", containerId);

            Logger.info(`Container for subdomain ${subdomain} stopped successfully.`);
            return res.status(200).json({ message: "Container stopped successfully." });
        } catch (error) {
            Logger.error(`Error stopping container for subdomain ${subdomain}: ${(error as Error).message}`);
            return res.status(500).json({ error: "Failed to stop the container." });
        }
    })

}

export function destroyContainer(app: express.Express) {

    app.get("/destroy:subdomain", async (req, res) => {
        const subdomain = req.params.subdomain;

        // 1. Validate subdomain
        if (!subdomain) {
            return res.status(400).json({ error: "Subdomain is required." });
        }
        try {
            // 2. Get containerId from database based on subdomain
            const deployment = getDeployment(subdomain);
            if (!deployment) {
                return res.status(404).json({ error: "Deployment not found." });
            }

            const containerId = (deployment as { containerId?: string }).containerId;
            if (!containerId) {
                return res.status(400).json({ error: "No container associated with this deployment." });
            }

            // 3. Stop and remove container from docker
            const container = docker.getContainer(containerId);
            const containerInfo = await container.inspect();
            const liveStatus = containerInfo.State.Status;
            if (liveStatus === "running") {
                await container.stop();
            }
            await container.remove();

            // 4. Update the deployment status in the database
            updateDeployment(subdomain, "destroyed", containerId);
            Logger.info(`Container for subdomain ${subdomain} destroyed successfully.`);

            return res.status(200).json({ message: "Container destroyed successfully." });
        } catch (error) {
            Logger.error(`Error destroying container for subdomain ${subdomain}: ${(error as Error).message}`);
            return res.status(500).json({ error: "Failed to destroy the container." });
        }

    })
}