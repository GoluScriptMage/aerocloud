#!/usr/bin/env node

import { Command } from "commander";
import { Logger } from "./utils/logger.js";
import { createArchive } from "./utils/archieve.js";
import fs from "node:fs";
import chalk from "chalk";
import { initConfigFile, readConfigFile } from "./utils/configHelper.js";
import readline from "node:readline";
import { Readable } from "node:stream";
import http from "node:http";
import { exec } from "node:child_process";
import { saveToken } from "./utils/authHelper.js";

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
        let customFileName: string = readConfigFile('name');
        if (!customFileName || customFileName.trim() === '') {
            customFileName = `app-${Math.random().toString(36).substring(2, 8)}`;
        }

        // 3.1 Check for env file and append to formdata
        if (!fs.existsSync(".env")) {
            Logger.warn("No .env file found. Proceeding without it.");
        }

        // 3.2 Create the env file blob if it exists
        const envBlob = fs.existsSync(".env") ? new Blob([fs.readFileSync(".env")], { type: "text/plain" }) : null;

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
        const nodeStream = Readable.fromWeb(response.body as any);
        const rl = readline.createInterface({ input: nodeStream });

        // Read the response line by line
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                const parsedLine = JSON.parse(line);

                // Handle different types of messages from the server
                if (parsedLine.type === "docker_build_output") {
                    process.stdout.write(parsedLine.message);
                } else if (parsedLine.type === "result") {
                    if (parsedLine.status === "success") {
                        Logger.success(`Deployment successful! Subdomain: ${parsedLine.subDomain}, Image: ${parsedLine.imageName}`);
                        Logger.info(`🌐 Live URL: http://${parsedLine.subDomain}.localhost:8080`);
                    } else {
                        Logger.error(`Deployment failed: ${parsedLine.message}`);
                    }
                }
            } catch (err) {
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
        };

        deployments.forEach((dep: any) => {
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

            }, null, 2))
        })
    });

// Stop the deployment by subdomain
program
    .command("stop <subdomain>")
    .description("Stop a deployment by subdomain")
    .action(async (subdomain: string) => {
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
    })

// Destroy the deployment by subdomain
program
    .command("destroy <subdomain>")
    .description("Destroy a deployment by subdomain")
    .action(async (subdomain: string) => {
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
    })


// Fetch logs for a deployment by subdomain
// follow the logs in real-time if the container is running
program
    .command("logs <subdomain>")
    .option("-f, --follow", "Follow logs in real-time if the container is running")
    .description("Fetch logs for a deployment by subdomain")
    .action(async (subdomain: string, options) => {

        // Check if the --follow option is set
        if (!options.follow) {
            Logger.info("Fetching logs in real-time for subdomain: " + subdomain);
            const response = await fetch(`http://localhost:3000/deployments/${subdomain}/logs`, {
                method: "GET"
            });

            if (!response.ok) {
                const errorData = await response.json();
                Logger.error(`Failed to fetch logs: ${errorData.message}`);
                return;
            }

            // Stream the logs in real-time
            const logs = await response.json();
            const logArray = logs.logs.split('\n').filter((line: string) => line.trim() !== '');
            Logger.log(`Logs for deployment ${subdomain}:`);
            logArray.forEach((log: string) => Logger.log(`${log}`));
            return;
        }

        // If the --follow option is not set, fetch the last 100 lines of logs
        const response = await fetch(`http://localhost:3000/deployments/${subdomain}/logs?follow=true`, {
            method: "GET"
        })

        const nodeStream = Readable.fromWeb(response.body as any);
        const rl = readline.createInterface({ input: nodeStream });

        // Read the response line by line
        Logger.info(`Streaming logs for deployment ${subdomain} (Press Ctrl+C to stop):`);
        for await (const line of rl) {
            if (!line.trim()) continue;
            Logger.log(line);
        }

    })

// For auth
program
    .command("auth")
    .description("Authenticate with GitHub")
    .action(async () => {
        Logger.info("Authenticating with GitHub...");

        // Step 1: Start a local server to listen for the callback
        const server = http.createServer((req, res) => {
            const url = new URL(req.url || "", `http://${req.headers.host}`);

            if (req.url?.startsWith("/callback")) {
                const token = url.searchParams.get("token");
                if (token) {
                    saveToken(token); // Save to the config file
                    res.writeHead(200, { "Content-Type": "text/html" });
                    res.end("<h1>Authentication successful! You can close this window.</h1>");

                    // Shut down CLI server cleanly 
                    server.close();
                    process.exit(0);
                }
            }
        })

        // Step 2: Open the GitHub OAuth URL in the user's default browser
        exec(`open http://localhost:3000/auth/github?port=3001`)
        Logger.info("Please complete the authentication in your browser. Waiting for callback...");
        server.listen(3001)

    })

// Parse the command-line arguments
program.parse(process.argv);