import type { Request, Response, NextFunction } from 'express';
import { Logger } from './logger.js';
import { getUserByApiKey, hashApiKey } from '../config/db.js';

export interface AuthenticatedRequest extends Request {
    user?: {
        githubId: string;
        username: string;
        email: string | null;
    }
}

export function authenticateUserMiddleware(req: Request, res: Response, next: NextFunction) {
    // Step 1: Check for the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        Logger.error("Missing or invalid Authorization header");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Step 2: Extract the API key from the Authorization header
    const apiKey = authHeader.split(' ')[1];
    if (!apiKey) {
        Logger.error("Missing API key in Authorization header");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Step 3: Hash the API key and fetch the user from the database
    const apiKeyHash = hashApiKey(apiKey);

    // Step 4: Retrieve the user associated with the hashed API key
    const user = getUserByApiKey(apiKeyHash);
    if (!user) {
        Logger.error("Invalid API key provided");
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Step 5: Attach the user information to the request object for downstream use
    (req as AuthenticatedRequest).user = user as any; // Attach user info to the request object
    next();

}