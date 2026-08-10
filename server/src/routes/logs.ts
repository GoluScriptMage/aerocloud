import express from 'express';
import { Logger } from '../utils/logger.js';
import { getDeployment } from '../config/db.js';
import Docker from '../config/docker.js';

/**
 * To log crashed container logs or running container logs
 * 
 */

export function getCrashLogs(app: express.Express) {
    app.get('/deployments/:subdomain/logs', async (req, res) => {

        const subDomain = req.params.subdomain;

        if (!subDomain) {
            return res.status(400).json({ message: 'Subdomain is required' });
        }

        try {
            const deployment = await getDeployment(subDomain);
            if (!deployment) {
                return res.status(404).json({ message: 'No deployment found for this subdomain' });
            }

            const containerId = (deployment as { containerId?: string }).containerId;
            if (!containerId) {
                return res.status(404).json({ message: 'No container associated with this deployment' });
            }

            // 1. Get the logs from the container using dockerode
            const container = Docker.getContainer(containerId);

            // 2. Fetch logs from the container
            const logs = await container.logs({
                stdout: true,
                stderr: true,
                tail: 100, // Fetch the last 100 lines of logs
                follow: false // Set to true if you want to stream logs
            })

            const logString = logs.toString('utf-8');
            Logger.info(`Fetched logs for subdomain ${subDomain}: ${logString}`);

            // 3. Send the logs as a response
            return res.status(200).json({ logs: logString });
        } catch (error) {
            Logger.error(`Error fetching logs for subdomain ${subDomain}: ${(error as Error).message}`);
            return res.status(500).json({ message: 'Failed to fetch logs', error: (error as Error).message });
        }

    })

}