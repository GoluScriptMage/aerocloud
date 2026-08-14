import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

// Initialize the database connection
const db: DatabaseType = new Database('aerocloud.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS deployments (
        subdomain TEXT PRIMARY KEY,
        containerId TEXT NULL,
        port INTEGER NULL,
        status TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        envVars TEXT NULL
    )
`)

// Function to save deployment information to the database
export function saveDeployment(subdomain: string, port: number, status: string, envVars?: string) {
    const statement = db.prepare('INSERT INTO deployments (subdomain, port, status, envVars) VALUES (?, ?, ?, ?)');
    statement.run(subdomain, port, status, envVars);
}

// Function to retrieve one deployment information from the database
export function getDeployment(subdomain: string) {
    const statement = db.prepare('SELECT * FROM deployments WHERE subdomain = ?')
    return statement.get(subdomain);
}

// Update deployment status/container
export function updateDeployment(subdomain: string, status: string, containerId: string, port?: number, envVars?: string) {
    const statement = db.prepare('UPDATE deployments SET containerId = ?, status = ?, port = ?, envVars = ? WHERE subdomain = ?')
    statement.run(containerId, status, port, envVars, subdomain);
}

// GET All deployments by desc order
export function getAllDeployments() {
    const statement = db.prepare('SELECT * FROM deployments ORDER BY createdAt DESC');
    return statement.all();
}

// Delete deployment
export function deleteDeployment(subdomain: string) {
    const statement = db.prepare('DELETE FROM deployments WHERE subdomain = ?');
    statement.run(subdomain)
}

// Return used ports
export function getUsedPorts() {
    const statement = db.prepare("SELECT port FROM deployments WHERE status IN ('deployed', 'deploying') ORDER BY port ASC");
    return statement.all();
}


export default db;