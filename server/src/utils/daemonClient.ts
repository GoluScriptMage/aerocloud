import net from 'node:net';
import { Logger } from './logger.js';

const SOCKET_ADDRESS = process.env.DAEMON_ADDRESS || '/tmp/aerocloud.sock';


// Lease port func
export function leasePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const client = net.createConnection(SOCKET_ADDRESS, () => {
            client.write('LEASE\n');
        })
        // Listen for Port
        client.on('data', (data) => {
            const port = parseInt(data.toString().trim(), 10);

            if (isNaN(port) || port === -1) {
                reject(new Error('Failed to lease port'));
                return;
            }

            Logger.info(`Leased port: ${port}`);
            resolve(port);
            client.end();
        })

        client.on('error', (err) => {
            reject(err);
        })
    })
}

// Release the port func
export function releasePort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {

        const client = net.createConnection(SOCKET_ADDRESS, () => {
            client.write(`RELEASE ${port}\n`)
        })

        // Listen for response
        client.on('data', (data) => {
            const response = data.toString().trim();
            if (response === 'OK') {
                resolve();
            } else {
                reject(new Error('Failed to release port'));
            }
            console.log(`Daemon response for releasing port ${port}: ${response}`);
            client.end();
        })

        client.on('error', (err) => {
            reject(err);
        })
    })
}