import fs from 'fs';
import path from 'path';
import os from 'os';
import { Logger } from './logger.js';

const CONFIG_DIR = path.join(os.homedir(), '.aerocloud');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function saveToken(token: string) {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        const data = { token };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
        Logger.success("Session credentials securely cached locally.");
    } catch (error) {
        Logger.error(`Failed to save configuration: ${(error as Error).message}`);
    }
}

export function getToken(): string | null {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            return null;
        }
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        return data.token || null;
    } catch (error) {
        return null;
    }
}
