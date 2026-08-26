import express from "express";
import { Logger } from "../utils/logger.js";
import { getAllProjects, saveProject, getDecryptedAccessToken } from "../config/db.js";

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

            // Automatically register webhook on GitHub via API (Zero manual clicks!)
            try {
                const token = getDecryptedAccessToken(userId);
                const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || "https://uncambered-tomoko-savouringly.ngrok-free.dev";
                if (token && webhookBaseUrl) {
                    const hookRes = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "User-Agent": "AeroCloud-Server",
                            Accept: "application/vnd.github.v3+json",
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            name: "web",
                            active: true,
                            events: ["push"],
                            config: {
                                url: `${webhookBaseUrl}/api/webhook/github`,
                                content_type: "json",
                                secret: process.env.WEBHOOK_SECRET || "aerocloud_secret"
                            }
                        })
                    });

                    if (hookRes.status === 201) {
                        Logger.success(`[AutoWebhook] Automatically registered GitHub webhook on ${repoFullName}! 🚀`);
                    } else if (hookRes.status === 422) {
                        Logger.info(`[AutoWebhook] Webhook already active on ${repoFullName}`);
                    } else {
                        const errBody = await hookRes.text();
                        Logger.warn(`[AutoWebhook] GitHub HTTP ${hookRes.status}: ${errBody}`);
                    }
                }
            } catch (hookErr) {
                Logger.warn(`[AutoWebhook] Could not auto-register webhook: ${(hookErr as Error).message}`);
            }

            return res.status(200).json({ success: true, message: `Project ${name} linked successfully` });

        } catch (err) {
            Logger.error("Error linking project.");
            return res.status(500).json({ error: "Internal server error" });
        }
    })
} 