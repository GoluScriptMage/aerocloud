import express, { type Request, type Response } from 'express';
import { Logger } from '../utils/logger.js';
import { updateProjectEnvVars, getProjectEnvVars } from '../config/db.js';

export function envRoutes(app: express.Express) {

    // Fetch project environment variables for a specific project
    app.get('/projects/:name/env', async (req: Request, res: Response) => {
        const projectName = req.params.name;
        if (typeof projectName !== 'string') {
            return res.status(400).json({ error: "Invalid project name" });
        }
        try {

            const userId = (req as any).user?.githubId;
            if (!userId) {
                Logger.error("User ID not found in request context.");
                return res.status(401).json({ error: "Unauthorized" });
            }

            const envVars = getProjectEnvVars(projectName, userId);
            if (!envVars) {
                Logger.error(`No environment variables found for project: ${projectName}`);
                return res.status(404).json({ error: `No environment variables found for project: ${projectName}` });
            }
            return res.status(200).json(envVars);
        } catch (error) {
            Logger.error(`Error fetching environment variables for project: ${projectName}`);
            return res.status(500).json({ error: 'Internal server error' });
        }
    })

    // Save or update environment variables for a specific project
    app.post('/projects/:name/env', async (req: Request, res: Response) => {

        const projectName = req.params.name;
        const { envVars } = req.body;
        if (typeof projectName !== 'string' || typeof envVars !== 'string') {
            return res.status(400).json({ error: "Invalid project name or environment variables" });
        }

        try {
            const userId = (req as any).user?.githubId;
            if (!userId) {
                Logger.error("User ID not found in request context.");
                return res.status(401).json({ error: "Unauthorized" });
            }
            const oldEnvVars = getProjectEnvVars(projectName, userId);
            if (oldEnvVars && oldEnvVars.envVars !== envVars) {
                // Append instead of replacing the existing envVars
                const updatedEnvVars = oldEnvVars.envVars + '\n' + envVars;
                updateProjectEnvVars(projectName, updatedEnvVars, userId);
                return res.status(200).json({ message: "Environment variables updated successfully" });
            }
            updateProjectEnvVars(projectName, envVars, userId);
            return res.status(200).json({ message: "Environment variables saved successfully" });
        } catch (error) {
            Logger.error(`Error saving environment variables for project: ${projectName}`);
            return res.status(500).json({ error: 'Internal server error' });
        }
    })

}