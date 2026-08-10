#!/usr/bin/env node
import { Command } from "commander";
import { Logger } from "./utils/logger.js";
import { createArchive } from "./utils/archieve.js";
import fs from "node:fs";
import { initConfigFile, readConfigFile } from "./utils/configHelper.js";
import readline from "node:readline";
import { Readable } from "node:stream";
const program = new Command();
// Define the "deploy" command
program
    .name("aerocloud")
    .description("Deploy your application to aerocloud");
program
    .command("init")
    .description("Initialize the aerocloud configuration file")
    .action(() => {
    initConfigFile();
});
// Define the "deploy" command
program
    .command("deploy")
    .description("Deploy your application to aerocloud")
    .action(async () => {
    Logger.info("Deploying your application to aerocloud...");
    // 1. get output dir of zip file
    const outputDirPath = await createArchive();
    // 2. Get output file buffer
    const outputFileBuffer = fs.readFileSync(outputDirPath);
    // 3. Set the Blob
    const fileBlob = new Blob([outputFileBuffer], { type: "application/zip" });
    let customFileName = readConfigFile('name');
    if (!customFileName || customFileName.trim() === '') {
        customFileName = `app-${Math.random().toString(36).substring(2, 8)}`;
    }
    // 4. Create Formdata & append fileBlob
    const formData = new FormData();
    formData.append('file', fileBlob, 'test.zip');
    formData.append('name', customFileName);
    // 5. Send the file using fetch post
    const response = await fetch("http://localhost:3000/deploy", {
        method: 'POST',
        body: formData,
    });
    if (!response.body) {
        Logger.error("No response stream received from server.");
        return;
    }
    // Convert Web ReadableStream (from native fetch) to Node.js Readable stream
    const nodeStream = Readable.fromWeb(response.body);
    const rl = readline.createInterface({ input: nodeStream });
    for await (const line of rl) {
        if (!line.trim())
            continue;
        try {
            const parsedLine = JSON.parse(line);
            if (parsedLine.type === "docker_build_output") {
                process.stdout.write(parsedLine.message);
            }
            else if (parsedLine.type === "result") {
                if (parsedLine.status === "success") {
                    Logger.success(`Deployment successful! Subdomain: ${parsedLine.subDomain}, Image: ${parsedLine.imageName}`);
                    Logger.info(`🌐 Live URL: http://${parsedLine.subDomain}.localhost:8080`);
                }
                else {
                    Logger.error(`Deployment failed: ${parsedLine.message}`);
                }
            }
        }
        catch (err) {
            // Ignore parse errors on malformed lines
        }
    }
});
program
    .command("list")
    .description("List all deployments")
    .action(async () => {
    Logger.info("Fetching deployments list from aerocloud...");
    const response = await fetch("http://localhost:3000/list", {
        method: "GET"
    });
    if (!response.ok) {
        Logger.error("Failed to fetch deployments list.");
        return;
    }
    const deployments = await response.json();
    if (deployments.length === 0) {
        Logger.info("No deployments found.");
        return;
    }
    ;
    deployments.forEach((dep) => {
        // Logs in JSON format for better readability and parsing
        Logger.info("Deployments:\n" + JSON.stringify({
            subdomain: dep.subdomain,
            port: dep.port,
            status: dep.status,
            createdAt: dep.createdAt.toLocaleString("en-IN", {
                dateStyle: 'short',
                timeStyle: 'short'
            }),
            containerStatus: dep.containerStatus || "Unknown",
            memoryUsage: dep.memoryUsage || "N/A"
        }, null, 2));
    });
});
// Stop the deployment by subdomain
program
    .command("stop <subdomain>")
    .description("Stop a deployment by subdomain")
    .action(async (subdomain) => {
    Logger.info(`Stopping deployment for subdomain: ${subdomain}...`);
    const response = await fetch(`http://localhost:3000/stop${subdomain}`, {
        method: "GET"
    });
    if (!response.ok) {
        const errorData = await response.json();
        Logger.error(`Failed to stop deployment: ${errorData.error}`);
        return;
    }
    const data = await response.json();
    Logger.success(data.message);
});
// Destroy the deployment by subdomain
program
    .command("destroy <subdomain>")
    .description("Destroy a deployment by subdomain")
    .action(async (subdomain) => {
    Logger.info(`Destroying deployment for subdomain: ${subdomain}...`);
    const response = await fetch(`http://localhost:3000/destroy${subdomain}`, {
        method: "GET"
    });
    if (!response.ok) {
        const errorData = await response.json();
        Logger.error(`Failed to destroy deployment: ${errorData.error}`);
        return;
    }
    const data = await response.json();
    Logger.success(data.message);
});
program
    .command("logs <subdomain>")
    .description("Fetch logs for a deployment by subdomain")
    .action(async (subdomain) => {
    Logger.info(`Fetching logs for deployment with subdomain: ${subdomain}...`);
    const response = await fetch(`http://localhost:3000/deployments/${subdomain}/logs`, {
        method: "GET"
    });
    if (!response.ok) {
        const errorData = await response.json();
        Logger.error(`Failed to fetch logs: ${errorData.message}`);
        return;
    }
    const logs = await response.json();
    const logArray = logs.logs.split('\n').filter((line) => line.trim() !== '');
    Logger.log(`Logs for deployment ${subdomain}:`);
    logArray.forEach((log) => Logger.log(`${log}`));
});
// Parse the command-line arguments
program.parse(process.argv);
