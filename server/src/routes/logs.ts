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

        const followQuery = req.query.follow;
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

            // 1.1 Check if the follow query parameter is set to true
            if (followQuery && followQuery === 'false') {
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
            } else {
                // 2. Stream logs from the container
                const logStream = await container.logs({
                    stdout: true,
                    stderr: true,
                    follow: true, // Stream logs in real-time
                    tail: 100 // Fetch the last 100 lines of logs
                })

                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache'); // Prevent caching of the response
                res.setHeader('Connection', 'keep-alive'); // Keep the connection open for streaming

                /**
                 * Clean the log stream and send it to the client in a readable format
                 * The logStream is a duplex stream that contains both stdout and stderr logs.
                 * 
                 */
                container.modem.demuxStream(logStream, res, res); // (logStream, stdout, stderr)
                req.on('close', () => {
                    (logStream as any).destroy?.(); // Stop streaming logs when the client disconnects
                    res.end();
                })

            }
        } catch (error) {
            Logger.error(`Error fetching logs for subdomain ${subDomain}: ${(error as Error).message}`);
            return res.status(500).json({ message: 'Failed to fetch logs', error: (error as Error).message });
        }

    })

}