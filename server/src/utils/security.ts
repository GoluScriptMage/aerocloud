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

// For encryption of access_token
export function encryptAccessToken(plainText: string): string {

    // Generate a random initialization vector
    const iv = crypto.randomBytes(12); // AES-GCM standard IV size is 12 bytes
    const algo: crypto.CipherGCMTypes = 'aes-256-gcm';

    // Creat a cipher using the 
    const key = Buffer.from(process.env.ACCESS_TOKEN_SECRET as string || 'default_32_byte_secret_key_123456', 'utf-8').subarray(0, 32);
    const cipher = crypto.createCipheriv(algo, key, iv);

    // Encrypt the plain-text
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()]); // final gives the remaing encrypted data and we merge with the previous encrypted data
    const authTag = cipher.getAuthTag(); // Get the authentication tag for AES-GCM

    // return the IV, authTag, and encrypted data as a single string (base64 encoded) to save in db
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`

}

// For Decryption of access_token
export function decryptAccessToken(encryptedText: string): string {
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
    const key = Buffer.from(process.env.ACCESS_TOKEN_SECRET as string || 'default_32_byte_secret_key_123456', 'utf-8').subarray(0, 32);

    // 1. Validate the input
    if (!ivHex || !authTagHex || !encryptedHex) {
        throw new Error('Invalid encrypted text format. Expected format: iv:authTag:encryptedData');
    }

    // 2. Create a decipher using the same algorithm, key, and IV
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex!, 'hex'));

    // 3. Attach the auth tag
    decipher.setAuthTag(Buffer.from(authTagHex!, 'hex'));

    // 4. Decrypt the data
    const decrypted = Buffer.concat([Buffer.from(decipher.update(Buffer.from(encryptedHex!, 'hex'))), decipher.final()]);
    return decrypted.toString('utf-8');
}