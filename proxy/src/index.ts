import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import httpProxy from 'http-proxy';

const app = express();
const proxy = httpProxy.createProxyServer({});

// 1. Initialize SQLite Database connection via native node:sqlite
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../../server/aerocloud.db");
const db = new DatabaseSync(dbPath);

console.log(`🚀 AeroCloud Proxy Server initialized with database at: ${dbPath}`);

app.use((req, res, next) => {
    const host = req.get('host');

    if (!host) {
        res.status(404).send("Deployment not found");
        return;
    }

    // Extract subdomain: e.g. "b6db3b.localhost:8080" -> "b6db3b"
    const subDomain = host.split('.')[0];
    if (!subDomain) {
        res.status(404).send("Deployment not found");
        return;
    }

    try {
        // Query deployments database for active deployment using node:sqlite
        const statement = db.prepare("SELECT * FROM deployments WHERE subdomain = ? AND status = 'deployed'");
        const deployment = statement.get(subDomain) as { subdomain: string; port?: number; status: string } | undefined;

        if (deployment) {
            if (deployment.port && deployment.port > 0) {
                // Level 2: Proxy traffic to active Docker container port
                console.log(`[Proxy] Routing ${req.protocol}://${req.host} -> http://localhost:${deployment.port}`);
                proxy.web(req, res, { target: `http://localhost:${deployment.port}` }, (err) => {
                    // console.error(`[Proxy Error] Forwarding failed: ${err.message}`);
                    res.status(502).send("Bad Gateway: Container unreachable");
                    console.log(`[Proxy Error] Forwarding failed for ${subDomain}: ${err.message}`);
                });
                return;
            }
        }

        // Level 1 Fallback: Check if static folder exists
        const deploymentsDir = path.resolve(__dirname, "../../server/deployments");
        const finalPath = path.join(deploymentsDir, subDomain);

        if (fs.existsSync(finalPath)) {
            console.log(`[Proxy Static] Serving static files for ${subDomain}`);
            express.static(finalPath)(req, res, next); 
            return;
        }

        res.status(404).send("Deployment not found");
    } catch (err: any) {
        console.error(`[Proxy Error] ${err.message}`);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(8080, () => {
    console.log("🚀 AeroCloud Proxy Server listening on PORT: 8080");
});