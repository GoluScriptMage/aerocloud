import { Logger } from "../utils/logger.js";
import express, { type Request, type Response } from "express";
import { getProjectByRepo } from "../config/db.js";
import crypto from "crypto";
import { secureCompare } from "../utils/security.js";

export function webhookRoutes(app: express.Express) {

    // To recieve webhook events updated about code push
    app.post("/api/webhook/github", async (req: Request, res: Response) => {
        try {

            // Step 1: Validate the webhook payload 
            const signature = req.headers['x-hub-signature-256'] as string;
            if (!signature) {
                Logger.error("Missing X-Hub-Signature-256 header");
                return res.status(400).json({ error: "Missing X-Hub-Signature-256 header" });
            }

            // Step 2. Validate the webhook payload signature (this is a placeholder, actual implementation may vary)
            const myHash = "sha256=" + crypto.createHmac('sha256', process.env.WEBHOOK_SECRET || 'aerocloud_secret').update(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)).digest('hex');

            // Step 3. Compare the computed hash with the signature from GitHub using secureCompare to prevent timing attacks
            if (!secureCompare(myHash, signature)) {
                Logger.error("Invalid webhook signature");
                return res.status(401).json({ error: "Invalid webhook signature" });
            }

            // 4. Get the repository name and full name from the webhook payload
            const data = req.body;
            const [repoName, repoFullName] = [data.repository.name, data.repository.full_name]
            if (!repoName || !repoFullName) {
                Logger.error("Missing repository information in the webhook payload");
                return res.status(400).json({ error: "Missing repository information in the webhook payload" });
            }

            // 5. Log the received webhook event & get the project
            Logger.info(`Received GitHub webhook event for repository: ${repoFullName}`);
            const project = getProjectByRepo(repoFullName);
            if (!project) {
                Logger.error(`No project found for repository: ${repoFullName}`);
                return res.status(404).json({ error: `No project found for repository: ${repoFullName}` });
            }

            // 6. Create a new deployment for the repository (placeholder)
            return res.status(200).json({ success: true, message: `Webhook received for ${(project as any).name}` });
        } catch (err) {
            Logger.error(`Error processing webhook: ${(err as Error).message}`);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    });

}