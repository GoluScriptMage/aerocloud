import { type NextFunction, type Request, type Response } from "express";
import { getAllBlockedEntities } from "../config/db.js";


const blockedIps = new Set<string>();
const blockedUsers = new Set<string>();

function fetchBlockedEntities() {
    const blockList = getAllBlockedEntities(); // Fetch all blocked entries from the database

    for (const entry of blockList) {
        if (entry.type === 'ip') {
            blockedIps.add(entry.value);
        } else if (entry.type === 'user') {
            blockedUsers.add(entry.value);
        }
    }
}

// Middleware to check if the request comes from a blocked IP or user
export function blockListGuard(req: Request, res: Response, next: NextFunction) {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';

    // Check the client IP against the blocked IPs
    if (blockedIps.has(clientIp)) {
        return res.status(403).json({ error: 'Access denied: Your IP is blocked.' });
    }

    // Check the user against the blocked users
    const user = (req as any).user; // Assuming user info is attached to the request object
    if (user && blockedUsers.has(user.githubId)) {
        return res.status(403).json({ error: 'Access denied: Your account is blocked.' });
    }

    next(); // Proceed to the next middleware or route handler
}

fetchBlockedEntities(); // Initial fetch of blocked entities