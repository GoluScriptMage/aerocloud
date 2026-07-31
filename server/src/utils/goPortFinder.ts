import exec from "child_process";
import path from "node:path";
import fs from "fs";
import { Logger } from "./logger.js";

// Function to find an available port using the goportscan binary
export async function findAvailablePort(startPort: number = 1024, endPort: number = 49151): Promise<number> {

    // 1. Get binary path of goportscan
    const binaryPath = path.join(process.cwd(), 'bin', 'goportscan');
    
    // 2. Check for binary existence
    if (!fs.existsSync(binaryPath)) {
        process.exit(1);
        Logger.error(`Error: goportscan binary not found at ${binaryPath}. Please ensure the binary is present in the 'bin' directory.`);
    }

    // 3. Execute the binary
    const args = ["-start", startPort.toString(), "-end", endPort.toString()]; // Use the provided start and end ports

    try {
        const result = exec.execFileSync(binaryPath, args, { encoding: "utf-8" });
        const port = parseInt(result.trim(), 10);

        if (isNaN(port) || port < startPort || port > endPort) {
            Logger.error(`Error: Invalid port returned by goportscan: ${result}`);
            process.exit(1);
        }
        return port;
    } catch (error) {
        Logger.error(`Error executing goportscan: ${error}`);
        process.exit(1);
    }

}