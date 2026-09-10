#!/usr/bin/env node
import { Command } from "commander";
import { Logger, parseServerError } from "./utils/logger.js";
import { createArchive } from "./utils/archieve.js";
import fs from "node:fs";
import chalk from "chalk";
import { initConfigFile, readConfigFile, sanitizeSubDomain, writeConfigFile } from "./utils/configHelper.js";
import readline from "node:readline";
import { Readable } from "node:stream";
import http from "node:http";
import { exec } from "node:child_process";
import { getToken, saveToken } from "./utils/authHelper.js";
import { linkHelper } from "./utils/linkHelper.js";
import { checkEnvFileExists, readEnvFile } from "./utils/envHelper.js";
const program = new Command();
program
    .name("aerocloud")
    .description("AeroCloud CLI - Deploy and manage cloud containers")
    .version("1.0.0");
// 1. init command
program
    .command("init")
    .description("Initialize the aerocloud configuration file")
    .action(() => {
    Logger.header("AeroCloud Init");
    initConfigFile();
});
// 2. deploy command
program
    .command("deploy")
    .description("Deploy your application to aerocloud")
    .action(async () => {
    Logger.header("Deploying to AeroCloud");
    const auth = getToken(false);
    const apiKey = auth?.apiKey;
    if (!apiKey) {
        Logger.error("Authentication required. Please run 'aerocloud auth' to authenticate.");
        process.exit(1);
    }
    initConfigFile(true); // Silent initialization if file already exists
    // 1. Create archive and measure timing
    const archiveTimer = Logger.timer();
    Logger.step("Packaging application source...");
    let outputDirPath;
    try {
        outputDirPath = await createArchive();
    }
    catch (err) {
        Logger.error("Failed to package source archive", err.message);
        process.exit(1);
    }
    Logger.step("Source archive packaged", archiveTimer());
    let customFileName = readConfigFile('name');
    if (!customFileName || customFileName.trim() === '') {
        customFileName = `app-${Math.random().toString(36).substring(2, 8)}`;
    }
    try {
        sanitizeSubDomain(customFileName);
    }
    catch (err) {
        Logger.error(err.message);
        try {
            if (fs.existsSync(outputDirPath))
                fs.unlinkSync(outputDirPath);
        }
        catch { }
        process.exit(1);
    }
    // Update the config file with the sanitized subdomain
    writeConfigFile({ ...readConfigFile(), name: customFileName });
    // 2. Read output file buffer
    const outputFileBuffer = fs.readFileSync(outputDirPath);
    const fileBlob = new Blob([outputFileBuffer], { type: "application/zip" });
    // 3. Environment variables
    const { exists, path: envFilePath } = checkEnvFileExists();
    if (!exists) {
        Logger.warn("No .env file found. Proceeding without environment variables.");
    }
    else {
        Logger.step("Loaded environment variables from .env");
    }
    const envData = readEnvFile(envFilePath);
    // 4. Create FormData
    const formData = new FormData();
    formData.append('file', fileBlob, 'test.zip');
    formData.append('name', customFileName);
    if (envData && envData.trim() !== '') {
        formData.append('envVars', envData);
    }
    // Clean up temporary local archive zip
    try {
        if (fs.existsSync(outputDirPath)) {
            fs.unlinkSync(outputDirPath);
        }
    }
    catch { }
    const deployTimer = Logger.timer();
    Logger.step(`Sending deployment request for '${customFileName}'...`);
    // 5. Send POST request
    let response;
    try {
        response = await fetch("http://localhost:3000/deploy", {
            method: 'POST',
            body: formData,
            headers: {
                authorization: `Bearer ${apiKey}`
            }
        });
    }
    catch (err) {
        Logger.error("Could not reach AeroCloud server", err.message);
        process.exit(1);
    }
    if (!response.ok) {
        const errorMsg = await parseServerError(response);
        Logger.error("Deployment failed", errorMsg);
        process.exit(1);
    }
    if (!response.body) {
        Logger.error("No response stream received from server.");
        process.exit(1);
    }
    // Convert Web ReadableStream to Node.js Readable stream
    const nodeStream = Readable.fromWeb(response.body);
    const rl = readline.createInterface({ input: nodeStream });
    let deploymentSucceeded = false;
    let deploymentFailed = false;
    let failureMessage = "";
    for await (const line of rl) {
        if (!line.trim())
            continue;
        try {
            const parsedLine = JSON.parse(line);
            if (parsedLine.type === "docker_build_output") {
                process.stdout.write(parsedLine.message);
            }
            else if (parsedLine.type === "step") {
                Logger.step(parsedLine.message);
            }
            else if (parsedLine.type === "result") {
                if (parsedLine.status === "success") {
                    const elapsed = deployTimer();
                    deploymentSucceeded = true;
                    Logger.success(`Deployment successful! [subdomain: ${parsedLine.subDomain}]`, elapsed);
                    console.log(`\n  ${chalk.cyan("🌐 Live URL:")} ${chalk.underline.bold(`http://${parsedLine.subDomain}.localhost:8080`)}\n`);
                }
                else {
                    deploymentFailed = true;
                    failureMessage = parsedLine.message || parsedLine.error || "Deployment failed";
                    Logger.error("Deployment failed", failureMessage);
                }
            }
            else if (parsedLine.error) {
                deploymentFailed = true;
                failureMessage = parsedLine.error;
                Logger.error("Deployment failed", failureMessage);
            }
        }
        catch {
            // If stream emitted raw non-JSON text
            process.stdout.write(line + "\n");
        }
    }
    if (deploymentFailed) {
        process.exit(1);
    }
    if (!deploymentSucceeded) {
        Logger.error("Deployment ended unexpectedly without a final success status.");
        process.exit(1);
    }
});
// 3. list command
program
    .command("list")
    .description("List all deployments")
    .action(async () => {
    const auth = getToken(false);
    const apiKey = auth?.apiKey;
    if (!apiKey) {
        Logger.error("Authentication required. Please run 'aerocloud auth' to authenticate.");
        process.exit(1);
    }
    Logger.step("Fetching deployments list from AeroCloud...");
    let response;
    try {
        response = await fetch("http://localhost:3000/list", {
            method: "GET",
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
    }
    catch (err) {
        Logger.error("Could not reach AeroCloud server", err.message);
        process.exit(1);
    }
    if (!response.ok) {
        const errorMsg = await parseServerError(response);
        Logger.error("Failed to fetch deployments list", errorMsg);
        process.exit(1);
    }
    let deployments;
    try {
        deployments = await response.json();
    }
    catch {
        Logger.error("Invalid response format received from server.");
        process.exit(1);
    }
    if (!Array.isArray(deployments) || deployments.length === 0) {
        Logger.step("No deployments found.");
        return;
    }
    Logger.header("Active Deployments");
    const headers = ["SUBDOMAIN", "STATUS", "PORT", "CPU", "MEMORY", "URL"];
    const rows = deployments.map((dep) => {
        const subdomain = dep.subdomain || "unknown";
        let status = "unknown";
        if (dep.containerStatus && dep.containerStatus !== "Down" && dep.containerStatus !== "N/A") {
            status = dep.containerStatus;
        }
        else if (dep.status) {
            status = dep.status;
        }
        else if (dep.containerStatus) {
            status = dep.containerStatus;
        }
        const lowerStatus = status.toLowerCase();
        if (lowerStatus === "running" || lowerStatus === "deployed") {
            status = `● ${status}`;
        }
        else if (lowerStatus === "crashed" || lowerStatus === "failed" || lowerStatus === "error" || lowerStatus === "down" || lowerStatus === "exited") {
            status = `○ ${status}`;
        }
        else if (lowerStatus === "stopped" || lowerStatus === "paused" || lowerStatus === "deploying") {
            status = `◐ ${status}`;
        }
        const port = dep.port ? String(dep.port) : "-";
        const memory = dep.memoryUsage && dep.memoryUsage !== "" ? dep.memoryUsage : "N/A";
        const cpu = dep.cpuUsage && dep.cpuUsage !== "" && dep.cpuUsage !== "N/A" ? `${dep.cpuUsage}%` : "N/A";
        const url = `http://${subdomain}.localhost:8080`;
        return [subdomain, status, port, cpu, memory, url];
    });
    Logger.table(headers, rows);
});
// 4. stop command
program
    .command("stop <subdomain>")
    .description("Stop a deployment by subdomain")
    .action(async (subdomain) => {
    const auth = getToken(false);
    const apiKey = auth?.apiKey;
    if (!apiKey) {
        Logger.error("Authentication required. Please run 'aerocloud auth' to authenticate.");
        process.exit(1);
    }
    if (!subdomain || !subdomain.trim()) {
        Logger.error("Subdomain is required.");
        process.exit(1);
    }
    Logger.step(`Stopping deployment '${subdomain}'...`);
    let response;
    try {
        response = await fetch(`http://localhost:3000/stop/${subdomain}`, {
            method: "GET",
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
    }
    catch (err) {
        Logger.error(`Failed to reach server to stop '${subdomain}'`, err.message);
        process.exit(1);
    }
    if (!response.ok) {
        const errorMsg = await parseServerError(response);
        Logger.error(`Failed to stop deployment '${subdomain}'`, errorMsg);
        process.exit(1);
    }
    const data = await response.json().catch(() => ({}));
    if (data.error) {
        Logger.error(`Failed to stop deployment '${subdomain}'`, data.error);
        process.exit(1);
    }
    Logger.success(data.message || `Deployment '${subdomain}' stopped successfully.`);
});
// 5. destroy command
program
    .command("destroy <subdomain>")
    .description("Destroy a deployment by subdomain")
    .action(async (subdomain) => {
    const auth = getToken(false);
    const apiKey = auth?.apiKey;
    if (!apiKey) {
        Logger.error("Authentication required. Please run 'aerocloud auth' to authenticate.");
        process.exit(1);
    }
    if (!subdomain || !subdomain.trim()) {
        Logger.error("Subdomain is required.");
        process.exit(1);
    }
    Logger.step(`Destroying deployment '${subdomain}'...`);
    let response;
    try {
        response = await fetch(`http://localhost:3000/destroy/${subdomain}`, {
            method: "GET",
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
    }
    catch (err) {
        Logger.error(`Failed to reach server to destroy '${subdomain}'`, err.message);
        process.exit(1);
    }
    if (!response.ok) {
        const errorMsg = await parseServerError(response);
        Logger.error(`Failed to destroy deployment '${subdomain}'`, errorMsg);
        process.exit(1);
    }
    const data = await response.json().catch(() => ({}));
    if (data.error) {
        Logger.error(`Failed to destroy deployment '${subdomain}'`, data.error);
        process.exit(1);
    }
    Logger.success(data.message || `Deployment '${subdomain}' destroyed successfully.`);
});
// 6. logs command
program
    .command("logs <subdomain>")
    .option("-f, --follow", "Follow logs in real-time if the container is running")
    .description("Fetch logs for a deployment by subdomain")
    .action(async (subdomain, options) => {
    const auth = getToken(false);
    const apiKey = auth?.apiKey;
    if (!apiKey) {
        Logger.error("Authentication required. Please run 'aerocloud auth' to authenticate.");
        process.exit(1);
    }
    if (!subdomain || !subdomain.trim()) {
        Logger.error("Subdomain is required.");
        process.exit(1);
    }
    if (!options.follow) {
        Logger.step(`Fetching logs for deployment '${subdomain}'...`);
        let response;
        try {
            response = await fetch(`http://localhost:3000/deployments/${subdomain}/logs`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${apiKey}`
                }
            });
        }
        catch (err) {
            Logger.error(`Could not reach server to fetch logs for '${subdomain}'`, err.message);
            process.exit(1);
        }
        if (!response.ok) {
            const errorMsg = await parseServerError(response);
            Logger.error(`Failed to fetch logs for '${subdomain}'`, errorMsg);
            process.exit(1);
        }
        const data = await response.json().catch(() => ({ logs: "" }));
        const logContent = typeof data === "string" ? data : (data.logs || data.message || "");
        const logArray = logContent.split('\n').filter((line) => line.trim() !== '');
        if (logArray.length === 0) {
            Logger.step(`No logs available for '${subdomain}'.`);
            return;
        }
        Logger.header(`Logs: ${subdomain}`);
        logArray.forEach((log) => console.log(`  ${chalk.dim("│")} ${log}`));
        return;
    }
    // Follow mode
    Logger.step(`Connecting to live log stream for '${subdomain}'...`);
    let response;
    try {
        response = await fetch(`http://localhost:3000/deployments/${subdomain}/logs?follow=true`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        });
    }
    catch (err) {
        Logger.error(`Could not reach server to stream logs for '${subdomain}'`, err.message);
        process.exit(1);
    }
    if (!response.ok) {
        const errorMsg = await parseServerError(response);
        Logger.error(`Failed to stream logs for '${subdomain}'`, errorMsg);
        process.exit(1);
    }
    if (!response.body) {
        Logger.error("No response stream received from server.");
        process.exit(1);
    }
    Logger.header(`Live Logs: ${subdomain} (Press Ctrl+C to exit)`);
    const nodeStream = Readable.fromWeb(response.body);
    const rl = readline.createInterface({ input: nodeStream });
    for await (const line of rl) {
        if (!line.trim())
            continue;
        console.log(`  ${chalk.dim("│")} ${line}`);
    }
});
// 7. auth command
program
    .command("auth")
    .option("-f, --force", "Force re-authentication with GitHub")
    .description("Authenticate with GitHub")
    .action(async (options) => {
    Logger.header("AeroCloud GitHub Authentication");
    const existingToken = getToken(false);
    const authTimestamp = existingToken?.authenticatedAt || existingToken?.authenciatedAt || 0;
    const hoursSinceAuth = (Date.now() - authTimestamp) / (1000 * 60 * 60);
    if (!options.force && existingToken?.apiKey && hoursSinceAuth < 8) {
        Logger.success("Already authenticated with GitHub.");
        if (existingToken.username) {
            Logger.step(`Logged in as: ${chalk.bold(existingToken.username)}`);
        }
        Logger.step(`Run ${chalk.cyan("aerocloud auth --force")} to re-authenticate.`);
        return;
    }
    const server = http.createServer((req, res) => {
        const url = new URL(req.url || "", `http://${req.headers.host}`);
        if (req.url?.startsWith("/callback")) {
            const token = url.searchParams.get("token");
            const apiKey = url.searchParams.get("apiKey") || null;
            const username = url.searchParams.get("username") || null;
            if (token && apiKey) {
                const authenticatedAt = Date.now();
                saveToken(token, username || undefined, apiKey, authenticatedAt);
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end("<h1>Authentication successful! You can close this window.</h1>");
                Logger.success("Authentication successful! Session credentials saved.");
                server.close();
                process.exit(0);
            }
            else {
                res.writeHead(400, { "Content-Type": "text/html" });
                res.end("<h1>Authentication failed: missing credentials</h1>");
                Logger.error("Authentication failed: invalid callback parameters.");
                server.close();
                process.exit(1);
            }
        }
    });
    server.on("error", (err) => {
        Logger.error("Failed to start local auth callback server", err.message);
        process.exit(1);
    });
    server.listen(3001, () => {
        Logger.step("Opening browser for GitHub authentication...");
        exec(`open http://localhost:3000/auth/github?port=3001`, (err) => {
            if (err) {
                Logger.warn("Could not open browser automatically. Please visit: http://localhost:3000/auth/github?port=3001");
            }
        });
        Logger.step("Waiting for authentication callback on port 3001...");
    });
});
// 8. link command
program
    .command("link")
    .description("Link your GitHub repository to aerocloud")
    .action(async () => {
    const auth = getToken(false);
    if (!auth?.apiKey) {
        Logger.error("Authentication required. Please run 'aerocloud auth' to authenticate.");
        process.exit(1);
    }
    await linkHelper();
});
program.parse(process.argv);
