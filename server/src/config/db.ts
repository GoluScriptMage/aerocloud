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
    );

    CREATE TABLE IF NOT EXISTS blocklist (
        type TEXT, -- 'ip' | 'user,
        value TEXT PRIMARY KEY,
        reason TEXT, 
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS projects (
        name TEXT PRIMARY KEY, 
        repoFullName TEXT NOT NULL,
        branch TEXT DEFAULT 'main',
        userId TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_projects_userId ON projects(userId);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_repoFullName ON projects(repoFullName);
`)


// Function to save or update user 
export function saveUser(githubId: string, username: string, email: string | null, apiKeyHash: string | null) {
    // Excluded sqllite ek special keyword hota jiska mtlb hai ki naye value jo hum query m pass kr rhe h
    const statement = db.prepare('INSERT INTO users(githubId, username, email, apiKeyHash) VALUES (?, ?, ?, ?) ON CONFLICT(githubId) DO UPDATE SET username = excluded.username, email = excluded.email, apiKeyHash = excluded.apiKeyHash');
    statement.run(githubId, username, email, apiKeyHash);
}

/** 
 * Deployment Functions
*/

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

/**
 * API Key Generation and Hashing Functions
 */

// Helper function to hash the raw api key
export function hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex'); // Converts the hash to a hexadecimal string
}

// Function to generate a unique API key for a user
export function generateApiKey(): string {
    return 'ac_live' + crypto.randomBytes(24).toString('hex'); // Generates a 48-character hexadecimal string
}

// Function to fetch user by apiKey 
export function getUserByApiKey(apiKeyHash: string) {
    const statement = db.prepare('SELECT * FROM users WHERE apiKeyHash = ?');
    return statement.get(apiKeyHash);
}


/**
 * Blocks - Save & Get functions
 */

// Function to get blocked IPs
export function getAllBlockedEntities() {
    const statement = db.prepare("SELECT type, value FROM blocklist");
    return statement.all() as { type: string, value: string }[];
}

// Save blocked entity to the database
export function saveBlockedEntity(type: string, value: string, reason: string) {
    const statement = db.prepare("INSERT INTO blocklist (type, value, reason) VALUES (?, ?, ?) ON CONFLICT(value) DO UPDATE SET reason = excluded.reason");
    statement.run(type, value, reason);
}

/**
 * Project Management Functions
 */

// Function to save project information to the database
export function saveProject(name: string, repoFullName: string, userId: string, branch?: string) {
    const statement = db.prepare("INSERT INTO projects (name, repoFullName, branch, userId) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET repoFullName = excluded.repoFullName, branch = excluded.branch");
    statement.run(name, repoFullName, branch ?? 'main', userId);
}

// Function to retrieve project information from the database
export function getAllProjects(userId: string) {
    const statement = db.prepare("SELECT * FROM projects WHERE userId = ?")
    return statement.all(userId);
}

// Function to delete project information from the database
export function deleteProject(name: string, userId: string) {
    const statement = db.prepare("DELETE FROM projects WHERE name = ? AND userId = ?");
    statement.run(name, userId);
}

export function getProjectByName(name: string, userId: string) {
    const statement = db.prepare("SELECT * FROM projects WHERE name = ? AND userId = ?");
    return statement.get(name, userId);
}

export function getProjectByRepo(repoFullName: string) {
    const statement = db.prepare("SELECT * FROM projects WHERE repoFullName = ?");
    return statement.get(repoFullName);
}

export default db;