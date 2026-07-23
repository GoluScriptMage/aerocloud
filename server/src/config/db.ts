import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

// Initialize the database connection
const db: DatabaseType = new Database('aerocloud.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS deployments (
        subdomain TEXT PRIMARY KEY,
        containerId TEXT NULLABLE,
        port INTEGER NULLABLE,
        status TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`)

// Function to save deployment information to the database
export function saveDeployment(subdomain: string, port: number, status: string) {
    const statement = db.prepare('INSERT INTO deployments (subdomain, port, status) VALUES (?, ?, ?)');
    statement.run(subdomain, port, status);
}

// Function to retrieve one deployment information from the database
export function getDeployment(subdomain: string) {
    const statement = db.prepare('SELECT FROM * deployment WHERE subdomain = ?')
    return statement.get(subdomain);
}

// Update deployment status/container
export function updateDeployment(subdomain: string, status: string, containerId: string) {
    const statement = db.prepare('UPDATE deployments SET containerId = ?, status = ? WHERE subdomain = ?')
    statement.run(containerId, status, subdomain);
}

// GET All deployments
export function getAllDeployments() {
    const statement = db.prepare('SELECT * FROM deployments');
    return statement.get();
}

// Delete deployment
export function deleteDeployment(subdomain: string) {
    const statement = db.prepare('DELETE FROM deployments WHERE subdomain = ?');
    statement.run(subdomain)
}

export default db;