import type { Request, Response, NextFunction } from 'express';
import { Logger } from './logger.js';
import { getUserByApiKey, hashApiKey } from '../config/db.js';
import { secureCompare } from './security.js';
import { generateApiKey } from '../config/db.js';

export interface AuthenticatedRequest extends Request {
    user?: {
        githubId: string;
        username: string;
        email: string | null;
    }
}

export function authenticateUserMiddleware(req: Request, res: Response, next: NextFunction) {

    if (req.path === '/favicon.ico' || req.path.startsWith('/auth') || req.path.startsWith('/api/webhook') || req.path === '/sw.js') {
        return next(); // Skip authentication for favicon, auth, and webhook routes
    }

    // Step 1: Check for the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        Logger.error("Missing or invalid Authorization header");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Step 2: Extract the API key from the Authorization header
    const apiKey = authHeader.split(' ')[1];
    if (!apiKey || apiKey.trim() === '') {
        Logger.error("Missing API key in Authorization header");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Step 3: Hash the API key and fetch the user from the database
    const apiKeyHash = hashApiKey(apiKey);

    // Step 4: Retrieve the user associated with the hashed API key
    let user = getUserByApiKey(apiKeyHash);
    if (!user) {
        user = { apiKeyHash: "0".repeat(64) }; // Generate a random hash to prevent timing attacks
    }

    // Step 5: Compare hashKey with stored hash in a timing-safe manner to prevent timing attacks
    const match = secureCompare(apiKeyHash, (user as any).apiKeyHash);
    if (!match) {
        Logger.error("Invalid API key");
        return res.status(401).json({ error: 'Unauthorized' });
    }
    Logger.info(`User authenticated successfully: ${(user as any).username}`);

    // Step 6: Attach the user information to the request object for downstream use
    (req as AuthenticatedRequest).user = user as any; // Attach user info to the request object
    next();

}