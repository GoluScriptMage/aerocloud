import path from 'path';
import fs from 'fs';
import { Logger } from './logger.js';

/**
 * Automatically generates a production-ready Dockerfile in the target directory 
 * if one does not already exist.
 * 
 * @param targetDir - The absolute or relative path to the project root directory.
 */
export function ensureDockerFile(targetDir: string): void {
    // Standard Docker naming convention uses a lowercase 'f' (Dockerfile)
    const dockerFilePath = path.join(targetDir, 'Dockerfile');

    // Skip generation if the user has already provided a custom Dockerfile
    if (fs.existsSync(dockerFilePath)) {
        return;
    }

    // Define instructions as an array to avoid unwanted multiline string indentation bugs
    const dockerfileLines = [
        '# Use the official lightweight Node.js 20 image built on Alpine Linux',
        'FROM node:20-alpine',
        '',
        '# Set the application directory inside the container',
        'WORKDIR /app',
        '',
        '# Copy package.json and package-lock.json first to leverage Docker layer caching',
        'COPY package*json ./',
        '',
        '# Install dependencies matching lockfile if present, or fallback to npm install',
        'RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi',
        '',
        '# Copy the rest of the application files into the working directory',
        'COPY . .',
        '',
        '# Compile TypeScript / build assets inside the container (if build script exists)',
        'RUN npm run build --if-present',
        '',
        '# Document that the container intends to listen on port 3000 at runtime',
        'EXPOSE 3000',
        '',
        '# Define the default command to start the application execution',
        'CMD ["npm", "start"]'
    ];

    // Combine lines with standard system line breaks and write the file
    const content = dockerfileLines.join('\n');
    fs.writeFileSync(dockerFilePath, content, 'utf-8');

    Logger.info(`Dockerfile has been generated at: ${dockerFilePath}`);
}
