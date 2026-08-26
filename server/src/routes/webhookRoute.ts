import { Logger } from "../utils/logger.js";
import express, { type Request, type Response } from "express";
import { getProjectByRepo, getDecryptedAccessToken } from "../config/db.js";
import crypto from "crypto";
import { secureCompare } from "../utils/security.js";
import { deployFromGitTarball } from "../utils/deployEngine.js";

export function webhookRoutes(app: express.Express) {

    // To receive webhook events updated about code push (supports both singular and plural)
    const handleWebhook = async (req: Request, res: Response) => {
        try {

            // Step 1: Validate the webhook payload 
            const signature = req.headers['x-hub-signature-256'] as string;
            if (!signature) {
                Logger.error("Missing X-Hub-Signature-256 header");
                return res.status(400).json({ error: "Missing X-Hub-Signature-256 header" });
            }

            // Step 2. Validate the webhook payload signature
            const myHash = "sha256=" + crypto.createHmac('sha256', process.env.WEBHOOK_SECRET || 'aerocloud_secret').update(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)).digest('hex');

            // Step 3. Compare the computed hash with the signature from GitHub using secureCompare to prevent timing attacks
            if (!secureCompare(myHash, signature)) {
                Logger.error("Invalid webhook signature");
                return res.status(401).json({ error: "Invalid webhook signature" });
            }

            // Step 3.1: Handle GitHub Ping Event
            const githubEvent = req.headers['x-github-event'];
            if (githubEvent === 'ping') {
                Logger.success("[Webhook] Received GitHub ping event! Connection verified.");
                return res.status(200).json({ message: "Pong! AeroCloud webhook verified successfully." });
            }

            // 4. Get the repository name and full name from the webhook payload
            const data = req.body;
            const repoFullName = data.repository?.full_name;
            if (!repoFullName) {
                Logger.error("Missing repository information in the webhook payload");
                return res.status(400).json({ error: "Missing repository information in the webhook payload" });
            }

            // 5. Log the received webhook event & get the project
            Logger.info(`Received GitHub webhook event for repository: ${repoFullName}`);
            const project = getProjectByRepo(repoFullName) as any;
            if (!project) {
                Logger.error(`No project found for repository: ${repoFullName}`);
                return res.status(404).json({ error: `No project found for repository: ${repoFullName}` });
            }

            // 6. Return 200 OK immediately to GitHub so it does not time out
            res.status(200).json({ success: true, message: `Deployment triggered for ${project.name}` });

            // 7. Trigger the build & container swap asynchronously in the background
            const decryptedToken = getDecryptedAccessToken(project.userId);
            if (!decryptedToken) {
                Logger.error(`[Webhook] No decrypted access token found for user ID: ${project.userId}`);
                return;
            }

            deployFromGitTarball({
                subDomain: project.name,
                repoFullName: repoFullName,
                branch: project.branch || "main",
                decryptedToken: decryptedToken,
                userId: project.userId,
                envVars: project.envVars
            }).then((result) => {
                Logger.success(`[Webhook] Continuous Deployment successful for ${project.name} on ${result.url}`);
            }).catch((err) => {
                Logger.error(`[Webhook] Deployment failed for ${project.name}: ${(err as Error).message}`);
            });

        } catch (err) {
            Logger.error(`Error processing webhook: ${(err as Error).message}`);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    };

    app.post("/api/webhook/github", handleWebhook);
    app.post("/api/webhooks/github", handleWebhook);
}