import type AdmZip from 'adm-zip';
import crypto, { randomBytes } from 'crypto';
import path from 'node:path';

// Function to Safely compare two string in a timing-safe manner to prevent timing attacks
export function secureCompare(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);

    // timing safe equal prevents leaking timing information about comparison
    return crypto.timingSafeEqual(bufferA, bufferB);
}

// Function to sanitize input strings to prevent SQL injection and other malicious inputs
export function sanitizeSubDomain(input: string): string {
    const regex = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;
    if (!regex.test(input)) {
        throw new Error(`Invalid inputs: ${input}. Only lowercase letters, numbers and hypens are allowed.`)
    }
    return input;
}

// Function to check zip file for security vulnerabilities
export function checkZipForSecurity(zipEntries: AdmZip.IZipEntry[], sizeLimit: number = 100, targetDir: string): void {
    let uncompressedSize = 0;
    for (const entry of zipEntries) {
        // Check for Zip size limit
        uncompressedSize += entry.header.size;

        // Root directory path 
        const rootDir = path.resolve(targetDir);

        // Path 
        const pathToCheck = path.resolve(path.join(targetDir, entry.entryName));

        if (uncompressedSize > sizeLimit * 1024 * 1024) { // 100 MB limit
            throw new Error(`Zip file exceeds the maximum allowed size of ${sizeLimit} MB.`);
        }

        // Check for Zip Slip vulnerability
        if (!pathToCheck.startsWith(rootDir)) {
            throw new Error(`Zip entry ${entry.entryName} is trying to escape the target directory. Possible Zip Slip attack.`);
        }
    }
}