import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { Logger } from './logger.js';
// Function to initialize the aerocloud configuration file
export function initConfigFile(quiet = false) {
    const fileName = 'aerocloud.json';
    const defaultName = path.basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'app';
    const data = {
        name: defaultName,
        publish: '.',
        buildCommand: '',
        repo: "",
        branch: "main",
    };
    // Check if file exists
    const targetFilePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(targetFilePath)) {
        fs.writeFileSync(targetFilePath, JSON.stringify(data, null, 4), 'utf-8');
        if (!quiet) {
            Logger.success(`Config file '${fileName}' initialized in the current directory.`);
        }
    }
    else if (!quiet) {
        Logger.step(`Config file '${fileName}' already exists.`);
    }
}
// Function to read the aerocloud configuration file
export function readConfigFile(params) {
    const targetFilePath = path.join(process.cwd(), 'aerocloud.json');
    if (!fs.existsSync(targetFilePath)) {
        return null;
    }
    try {
        const configData = JSON.parse(fs.readFileSync(targetFilePath, 'utf-8'));
        if (params) {
            return configData[params];
        }
        return configData;
    }
    catch {
        return null;
    }
}
export function writeConfigFile(data) {
    const targetFilePath = path.join(process.cwd(), 'aerocloud.json');
    try {
        fs.writeFileSync(targetFilePath, JSON.stringify(data, null, 4), 'utf-8');
    }
    catch (err) {
        Logger.error(`Failed to write config file 'aerocloud.json'`, err.message);
    }
}
// Function to run the build command if it exists in the configuration file
export function runBuildCommandIfExists() {
    const buildCommand = readConfigFile('buildCommand');
    if (buildCommand && buildCommand.trim() !== '') {
        Logger.step(`Executing build command: ${buildCommand}`);
        try {
            // Execute the build command
            execSync(buildCommand, { stdio: 'inherit', shell: true });
        }
        catch (error) {
            Logger.error('Error executing build command', error.message);
            process.exit(1); // Exit the process with an error code
        }
    }
}
// Function to sanitize input strings to prevent SQL injection and other malicious inputs
export function sanitizeSubDomain(input) {
    const regex = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;
    if (!regex.test(input)) {
        throw new Error(`Invalid inputs: ${input}. Only lowercase letters, numbers and hypens are allowed.`);
    }
    return input;
}
