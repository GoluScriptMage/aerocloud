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

/**
 * Saves deployment information to the database.
 *
 * @param subdomain - The deployment's unique subdomain
 * @param port - The port used by the deployment
 * @param status - The deployment's current status
 */
export function saveDeployment(subdomain: string, port: number, status: string) {
    const statement = db.prepare('INSERT INTO deployments (subdomain, port, status) VALUES (?, ?, ?)');
    statement.run(subdomain, port, status);
}

/**
 * Retrieves deployment information for a subdomain.
 *
 * @param subdomain - The deployment subdomain to look up
 * @returns The matching deployment record, if found
 */
export function getDeployment(subdomain: string) {
    const statement = db.prepare('SELECT FROM * deployment WHERE subdomain = ?')
    return statement.get(subdomain);
}

/**
 * Updates the status and container identifier for a deployment.
 *
 * @param subdomain - The deployment subdomain used to identify the record
 * @param status - The deployment's new status
 * @param containerId - The deployment's new container identifier
 */
export function updateDeployment(subdomain: string, status: string, containerId: string) {
    const statement = db.prepare('UPDATE deployments SET containerId = ?, status = ? WHERE subdomain = ?')
    statement.run(containerId, status, subdomain);
}

/**
 * Retrieves a deployment record from the deployments table.
 *
 * @returns The first deployment record, or `undefined` when the table is empty.
 */
export function getAllDeployments() {
    const statement = db.prepare('SELECT * FROM deployments');
    return statement.get();
}

/**
 * Deletes the deployment identified by its subdomain.
 *
 * @param subdomain - The subdomain of the deployment to delete
 */
export function deleteDeployment(subdomain: string) {
    const statement = db.prepare('DELETE FROM deployments WHERE subdomain = ?');
    statement.run(subdomain)
}

export default db;