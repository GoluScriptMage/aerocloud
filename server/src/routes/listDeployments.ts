
import express from "express";
import { getAllDeployments } from "../config/db.js";
import docker from "../config/docker.js";
import { info } from "console";
import { Logger } from "../utils/logger.js";

type DeploymentWithContainerInfo = {
    subdomain: string;
    port: number | null;
    status: string;
    createdAt: string;
    containerId: string | null;
    containerStatus?: string; // e.g., "running", "exited", "paused", etc.
}
// Route to get all deployments
export function listDeployments(app: express.Express) {


    app.get("/list", async (req, res) => {
        try {
            // 1. Get all deployments from the database
            const deployments = getAllDeployments() as DeploymentWithContainerInfo[];

            // 2. Promise.all to get container info for each deployment
            const deploymentsWithContainerInfo = await Promise.all(deployments.map(
                async (dep: DeploymentWithContainerInfo) => {
                    // 2b. Base Info for each deployment
                    const baseInfo = {
                        subdomain: dep.subdomain,
                        port: dep.port,
                        status: dep.status,
                        createdAt: dep.createdAt,
                        containerStatus: "Down"
                    }

                    // 2c. If containerId doesn't exists, get return base info
                    if (dep.containerId === null) {
                        return baseInfo;
                    }

                    // 3. Get container info from Docker 
                    try {
                        //  Get container info from docker
                        const container = docker.getContainer(dep.containerId);
                        const containerInfo = await container.inspect();
                        const liveStatus = containerInfo.State.Status; // return running, exited, etc

                        // 4. Return the deployment info with container status
                        return {
                            ...baseInfo,
                            containerStatus: liveStatus
                        }

                    } catch (error) {
                        return {
                            ...baseInfo,
                            containerId: dep.containerId,
                            containerStatus: "Error"
                        }
                    }

                }
            ))

            // 5. Send the response with deployments and their container info
            res.status(200).json(deploymentsWithContainerInfo);

        } catch (error) {
            Logger.error("Error fetching deployments: " + (error as Error).message);
            res.status(500).json({ error: "Internal server error" });
        }

    })

}