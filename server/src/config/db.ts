import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

// Initialize the database connection
const db: DatabaseType = new Database('aerocloud.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        githubId TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        apiKeyHash TEXT UNIQUE NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    
    CREATE TABLE IF NOT EXISTS deployments (
        subdomain TEXT PRIMARY KEY,
        containerId TEXT NULL,
        port INTEGER NULL,
        status TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        envVars TEXT NULL,
        userId INTEGER NULL,
        FOREIGN KEY(userId) REFRENCES users(githubId)
        
    )
`)

// Function to save deployment information to the database
export function saveDeployment(subdomain: string, port: number, status: string, envVars?: string, userId?: string) {
    const statement = db.prepare('INSERT INTO deployments (subdomain, port, status, envVars, userId) VALUES (?, ?, ?, ?, ?)');
    statement.run(subdomain, port, status, envVars, userId || null);
}

// Function to retrieve one deployment information from the database
export function getDeployment(subdomain: string, userId: string) {
    const statement = db.prepare('SELECT * FROM deployments WHERE subdomain = ? AND userId = ?');
    return statement.get(subdomain, userId);
}

// Update deployment status/container
export function updateDeployment(subdomain: string, status: string, containerId: string, port?: number, envVars?: string, userId?: string) {
    const statement = db.prepare('UPDATE deployments SET containerId = ?, status = ?, port = ?, envVars = ? WHERE subdomain = ? AND userId = ?');
    statement.run(containerId, status, port, envVars, subdomain, userId || null);
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


export default db;