import express from "express";
import { Logger } from "../utils/logger.js";
import { getAllProjects, saveProject } from "../config/db.js";

export function linkRepo(app: express.Express) {

    // Route to fetch all linked projects for the authenticated user
    app.get("/projects", async (req: express.Request, res: express.Response) => {
        // Implementation for fetching linked projects
        Logger.info("Fetching linked projects for the authenticated user.");
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


    // Route to link a GitHub repository to aerocloud
    app.post("/projects/link", async (req: express.Request, res: express.Response) => {
        try {
            const userId = (req as any).user.githubId;
            if (!userId) {
                Logger.error("User ID not found in request context.");
                return res.status(401).json({ error: "Unauthorized" });
            }

            const { name, repoFullName, branch, } = req.body;
            if (!name || !repoFullName) {
                Logger.error("Missing required fields: name or repoFullName.");
                return res.status(400).json({ error: "Missing required fields: name or repoFullName" });
            }

            // Save the project to the database
            saveProject(name, repoFullName, userId, branch);
            Logger.info(`Project linked successfully: ${name}`);

        } catch (err) {
            Logger.error("Error linking project.");
            return res.status(500).json({ error: "Internal server error" });
        }
    })
} 