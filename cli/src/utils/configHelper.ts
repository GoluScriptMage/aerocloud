import path from 'path'
import fs from 'fs'
import chalk from 'chalk';
import { config } from 'process';
import { execSync } from 'child_process';
import { Logger } from './logger.js';

// Function to initialize the aerocloud configuration file
export function initConfigFile() {
    const fileName = 'aerocloud.json'

    const defaultName = path.basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'app';
    const data = {
        name: defaultName,
        publish: '.',
        buildCommand: '',
        repo: "",
        branch: "main",
    }

    // Check if file exists
    const targetFilePath = path.join(process.cwd(), fileName);
    console.log(chalk.blue(`Checking for existing config file at: ${targetFilePath}`));
    
    if (!fs.existsSync(targetFilePath)) {
        fs.writeFileSync(targetFilePath, JSON.stringify(data, null, 4), 'utf-8');
    }

    Logger.success(`Config file '${fileName}' has been initialized in the current directory.`)
}

// Function to read the aerocloud configuration file
export function readConfigFile(params?: string) {
    const targetFilePath = path.join(process.cwd(), 'aerocloud.json');
    if (!fs.existsSync(targetFilePath)) {
        Logger.error(`Config file 'aerocloud.json' not found in the current directory.`);
        return null;
    }

    const configData = JSON.parse(fs.readFileSync(targetFilePath, 'utf-8'));

    if (params) {
        return configData[params]
    }
    return configData;
}

export function writeConfigFile(data: any) {
    const targetFilePath = path.join(process.cwd(), 'aerocloud.json');
    if (!fs.existsSync(targetFilePath)) {
        Logger.error(`Config file 'aerocloud.json' not found in the current directory.`);
        return;
    }

    fs.writeFileSync(targetFilePath, JSON.stringify(data, null, 4), 'utf-8');
}

// Function to run the build command if it exists in the configuration file
export function runBuildCommandIfExists() {
    const buildCommand = readConfigFile('buildCommand');
    if (buildCommand) {
        Logger.info(`Executing build command: ${buildCommand}`);
        try {
            // Execute the build command
            execSync(buildCommand, { stdio: 'inherit', shell: true } as any);
        } catch (error) {
            Logger.error('Error executing build command:');
            process.exit(1); // Exit the process with an error code
        }
    }
}

// Function to sanitize input strings to prevent SQL injection and other malicious inputs
export function sanitizeSubDomain(input: string): string {
    const regex = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;
    if (!regex.test(input)) {
        throw new Error(`Invalid inputs: ${input}. Only lowercase letters, numbers and hypens are allowed.`)
    }
    return input;
}