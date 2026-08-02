/**
 * Proxy main work serving the url 
 * e.g. http://4gsd4h.localhost:8080 
 * We will check for route h serve the file for this route 
 */


import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from "node:fs"
import { DatabaseSync } from 'node:sqlite';
import { createProxyServer } from 'http-proxy';

const app = express();
const proxy = createProxyServer();

// 1. Database path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../../server/aerocloud.db");

// 2. Database connection
const db = new DatabaseSync(dbPath);

// 3. Query the db for the subdomain and get the deployment path
function getDeploymentPath(subdomain: string) {
    const statement = db.prepare("SELECT * FROM deployments WHERE subdomain = ? AND status = 'deployed'");
    return statement.get(subdomain) as { subdomain: string, port: number, status: string } | null;
}

app.use((req, res, next) => {


    const host = req.get('host');

    if (!host) res.status(404).send("Deployment not found");
    const subDomain = host?.split('.')[0];

    const deployment = getDeploymentPath(subDomain!);

    // If deployments doesn't exist go for static server
    if (!deployment) {
        const deploymentsDir = path.resolve(__dirname, "../../server/de/ployments"); // This drop 2 level to parent and search for sevrer folder
        const finalPath = path.join(deploymentsDir, subDomain!);

        // Check for final path
        if (fs.existsSync(finalPath)) {
            // Execute dynamic static server
            express.static(finalPath)(req, res, next);
            return;
        } else {
            res.status(404).send("Deployment not found");
        }
    }

    if (deployment!.status === "deployed" && deployment?.port) {
        // Level 2: Prxoy to docker container
        proxy.web(req, res, {
            target: `http://localhost:${deployment.port}`
        })
    }


})

app.listen(8080, () => {
    console.log("Server listening on PORT: 8080");
})