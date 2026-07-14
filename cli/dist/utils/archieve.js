// @ts-ignore
import { ZipArchive } from "archiver";
import path from "node:path";
import fs from "node:fs";
import chalk from "chalk";
export function createArchive() {
    return new Promise((resolve, reject) => {
        // Step 1: Create archive instance with zip format and maximum compression level
        console.log(chalk.yellow.italic("Creating archive..."));
        const archive = new ZipArchive({
            zlib: {
                level: 9 // Important: Set the compression level to maximum (9) for lowest size possible 
            }
        });
        // Step 2: Get output directory path and create a write stream for the archive
        const outputDirPath = path.join(process.cwd(), "test.zip"); // Output dir
        const output = fs.createWriteStream(outputDirPath);
        archive.pipe(output);
        // Important: Listen for the 'close' event to resolve the promise when the archive is finalized
        output.on("close", () => {
            console.log(chalk.italic.green(`Archive created successfully`));
            resolve(outputDirPath); // Resolve the promise when the archive is finalized
        });
        // Step 3: Add files to the archive
        archive.glob("**/*", {
            cwd: process.cwd(), // Current working directory
            ignore: ["node_modules/**", "dist/**", "test.zip"], // Ignore node_modules, dist, and the output zip file itself
            dot: true // Include hidden files (.e.g .gitignore)
        });
        // Step 4: Finalize the archive
        archive.finalize();
    });
}
