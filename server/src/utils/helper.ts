import path from "path";
import fs from "fs";
import { Logger } from "./logger.js";
import dotenv from "dotenv";
import { encryptAccessToken } from "./security.js";


// Function to get the exposed port of a deployment 
export function getExposedPort(targetDir: string): number {
    const envFilePath = path.join(targetDir, '.env');
    const dockerfilePath = path.join(targetDir, 'Dockerfile');

    /** 
     * Port Priority Logic: .evn > DockerFile(multi port) first port > DockerFile(single port) > default port 4000
     */

    // Return early if the .env file exists and contains a PORT variable
    if (fs.existsSync(envFilePath)) {
        const envFileContent = fs.readFileSync(envFilePath, 'utf-8');
        const portMatch = envFileContent.match(/^PORT=(\d+)$/m);
        if (portMatch) {
            return parseInt(portMatch[1]!, 10);
        }
    }

    // Docker file port
    if (fs.existsSync(dockerfilePath)) {
        const dockerFileContent = fs.readFileSync(dockerfilePath, 'utf-8');
        const match = dockerFileContent.match(/^EXPOSE\s+(\d+)$/m)

        if (match) {
            return parseInt(match[1]!, 10);
        }
    }

    return 4000; // Default port if none specified
}

// Convert raw to JSON string
export function normalizeEnv(rawEnv?: string): string {
    if (!rawEnv || rawEnv.trim() === '') return '{}';
    try {
        JSON.parse(rawEnv);
        return encryptAccessToken(rawEnv);
    } catch (err) {
        return encryptAccessToken(JSON.stringify(dotenv.parse(rawEnv)))
    }
}

// Converts JSON string to DOcker format array of strings
export function formatEnvForDocker(envJson?: string): string[] | undefined {
    if (!envJson || envJson === '{}') return undefined;
    try {
        const obj = JSON.parse(envJson);
        const entries = Object.entries(obj).map(([k, v]) => `${k}=${v}`);
        return entries.length > 0 ? entries : undefined;
    } catch {
        return undefined;
    }
}