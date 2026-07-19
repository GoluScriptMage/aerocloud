/**
 * Proxy main work serving the url 
 * e.g. http://4gsd4h.localhost:8080 
 * We will check for route h serve the file for this route 
 */


import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from "node:fs"

const app = express();

app.use((req, res, next) => {
    const host = req.get('host');

    if (!host) res.status(404).send("Deployment not found");
    const subDomain = host?.split('.')[0];

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const deploymentsDir = path.resolve(__dirname, "../../server/deployments"); // This drop 2 level to parent and search for sevrer folder
    const finalPath = path.join(deploymentsDir, subDomain!);

    // Check for final path
    if (fs.existsSync(finalPath)) {
        console.log("Came here")
        // Execute dynamic static server
        express.static(finalPath)(req, res, next);
    } else {
        res.status(404).send("Deployment not found");
    }

    console.log("Final Path logging: ", finalPath);
})

app.listen(8080, () => {
    console.log("Server listening on PORT: 8080");
})