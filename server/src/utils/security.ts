import crypto, { randomBytes } from 'crypto';

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