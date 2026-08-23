import express from "express";
import { Logger } from "../utils/logger.js";
import { getAllProjects } from "../config/db.js";

export function linkRepo(app: express.Express) {

    app.get("/projects", async (req: express.Request, res: express.Response) => {
        // Implementation for fetching linked projects
        try {
            const userId = (req as any).user?.githubId;
            if (!userId) {
                Logger.error("User ID not found in request context.");
                return res.status(401).json({ error: "Unauthorized" });
            }
            // Fetch all projects 
            const projects = getAllProjects(userId);

            // Return the projects
            return res.status(200).json(projects);
        } catch (error) {
            Logger.error("Error fetching linked projects.");
            return res.status(500);
        }
    });
} 