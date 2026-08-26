// Check the current dir has a config file or not
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export function checkEnvFileExists() {
    const configFilePath = path.join(process.cwd(), '.env');
    const exists = fs.existsSync(configFilePath);
    return { exists, path: configFilePath };
}

export function readEnvFile(pathToEnvFile: string) {
    // If env exists, read it 
    const targetFilePath = pathToEnvFile || path.join(process.cwd(), '.env');
    if (!fs.existsSync(targetFilePath)) {
        console.error(`.env file not found at: ${targetFilePath}`);
        return null;
    }

    const envContent: Buffer | null = fs.readFileSync(targetFilePath);

    // Parse the env content using dotenv
    const parsedEnv = envContent && JSON.stringify(dotenv.parse(envContent));

    return parsedEnv;
}