import fs from 'fs';
import path from 'path';
import os from 'os';
import { Logger } from './logger.js';

const CONFIG_DIR = path.join(os.homedir(), '.aerocloud');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function saveToken(token: string, username?: string, apiKey?: string, authenciatedAt?: number): void {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        const data = { token, username, apiKey, authenciatedAt };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
        Logger.success("Session credentials securely cached locally.");
    } catch (error) {
        Logger.error(`Failed to save configuration: ${(error as Error).message}`);
    }
}

export function getToken(onlytoken: boolean): string | null {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            return null;
        }
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        if (onlytoken) {
            return data.token || null;
        }
        return data;
    } catch (error) {
        return null;
    }
}
