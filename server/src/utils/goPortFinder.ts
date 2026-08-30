import { execFile } from "child_process";
import path from "node:path";
import fs from "fs";
import { Logger } from "./logger.js";
import { getUsedPorts } from "../config/db.js";

// Function to find an available port using the goportscan binary
export async function findAvailablePort(startPort: number = 4000, endPort: number = 9000): Promise<number> {

    // 1. Get binary path of goportscan
    const binaryPath = path.join(process.cwd(), 'bin', 'goportscan');

    // 2. Check for binary existence
    if (!fs.existsSync(binaryPath)) {
        throw new Error (`Error: goportscan binary not found at ${binaryPath}. Please ensure the binary is present in the 'bin' directory.`);
    }

    // Query Database for the used ports
    const usedPorts = getUsedPorts(); // Pass the userId to getUsedPorts function
    const usedPortList = usedPorts.map((row: any) => row.port).join(",");

    // 3. Execute the binary
    const args = ["-start", startPort.toString(), "-end", endPort.toString()]; // Use the provided start and end ports

    try {
        const result = await new Promise<string>((resolve, reject) => {
            const child = execFile(binaryPath, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
                if (error) {
                    Logger.error(`Error executing goportscan: ${error.message}`);
                    reject(new Error(`Error executing goportscan: ${error.message}`));
                    return;
                }
                if (stderr) {
                    Logger.error(`Error output from goportscan: ${stderr}`);
                    reject(new Error(`Error output from goportscan: ${stderr}`));
                    return;
                }
                resolve(stdout);
            });

            // Stream occupied ports from SQLite database to the binary's stdin
            if (child.stdin) {
                const portsList = usedPorts.map((row: any) => row.port).join(",");
                child.stdin.write(portsList + "\n");
                child.stdin.end();
            }
        });
        const port = parseInt(result.trim(), 10);

        if (isNaN(port) || port
            < startPort || port > endPort) {
            Logger.error(`Error: Invalid port returned by goportscan: ${result}`);
            throw new Error(`Error: Invalid port returned by goportscan: ${result}`);
        }
        return port;
    } catch (error) {
        Logger.error(`Error executing goportscan: ${error}`);
        throw new Error(`Error executing goportscan: ${error}`);
    }

}