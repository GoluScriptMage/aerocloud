import crypto, { randomBytes } from 'crypto';

// Function to Safely compare two string in a timing-safe manner to prevent timing attacks
export function secureCompare(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);

    // timing safe equal prevents leaking timing information about comparison
    return crypto.timingSafeEqual(bufferA, bufferB);
}

