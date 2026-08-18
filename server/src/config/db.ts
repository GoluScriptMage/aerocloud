import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import crypto from "crypto";

// Initialize the database connection
const db: DatabaseType = new Database('aerocloud.db');

// Email null allowed to handle private profiles

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        githubId TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT NULL, 
        apiKeyHash TEXT UNIQUE NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS deployments (
        subdomain TEXT PRIMARY KEY,
        containerId TEXT NULL,
        port INTEGER NULL,
        status TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        envVars TEXT NULL,
        userId INTEGER NULL,
        FOREIGN KEY(userId) REFERENCES users(githubId)
        
    )
`)

// Function to save or update user 
export function saveUser(githubId: string, username: string, email: string | null, apiKeyHash: string | null) {
    // Excluded sqllite ek special keyword hota jiska mtlb hai ki naye value jo hum query m pass kr rhe h
    const statement = db.prepare('INSERT INTO users(githubId, username, email, apiKeyHash) VALUES (?, ?, ?, ?) ON CONFLICT(githubId) DO UPDATE SET username = excluded.username, email = excluded.email, apiKeyHash = excluded.apiKeyHash');
    statement.run(githubId, username, email, apiKeyHash);
}

// Function to fetch user by apiKey 
export function getUserByApiKey(apiKeyHash: string) {
    const statement = db.prepare('SELECT * FROM users WHERE apiKeyHash = ?');
    return statement.get(apiKeyHash);
}

// Function to save deployment information to the database
export function saveDeployment(subdomain: string, port: number, status: string, envVars?: string, userId?: string) {
    const statement = db.prepare('INSERT INTO deployments (subdomain, port, status, envVars, userId) VALUES (?, ?, ?, ?, ?)');
    statement.run(subdomain, port, status, envVars ?? null, userId ?? null);
}

// Function to retrieve one deployment information from the database
export function getDeployment(subdomain: string, userId?: string) {
    const statement = db.prepare('SELECT * FROM deployments WHERE subdomain = ? AND userId = ?');
    return statement.get(subdomain, userId ?? null);
}

// function to get subdomain
export function getSubDomain(subdomain: string) {
    const statement = db.prepare('SELECT * FROM deployments WHERE subdomain = ?');
    return statement.get(subdomain);
}

// Update deployment status/container
export function updateDeployment(subdomain: string, status: string, containerId: string, port?: number, envVars?: string, userId?: string) {
    const statement = db.prepare('UPDATE deployments SET containerId = ?, status = ?, port = ?, envVars = ? WHERE subdomain = ? AND userId = ?');
    statement.run(containerId, status, port ?? null, envVars ?? null, subdomain, userId ?? null);
}

// GET All deployments by desc order
export function getAllDeployments(userId: string) {
    const statement = db.prepare('SELECT * FROM deployments WHERE userId = ? ORDER BY createdAt DESC');
    return statement.all(userId);
}

// Delete deployment
export function deleteDeployment(subdomain: string, userId: string) {
    const statement = db.prepare('DELETE FROM deployments WHERE subdomain = ? AND userId = ?');
    statement.run(subdomain, userId);
}

// Return used ports
export function getUsedPorts() {
    const statement = db.prepare("SELECT port FROM deployments WHERE status IN ('deployed', 'deploying') ORDER BY port ASC");
    return statement.all();
}

// Helper function to hash the raw api key
export function hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex'); // Converts the hash to a hexadecimal string
}

// Function to generate a unique API key for a user
export function generateApiKey(): string {
    return 'ac_live' + crypto.randomBytes(24).toString('hex'); // Generates a 48-character hexadecimal string
}

export default db;