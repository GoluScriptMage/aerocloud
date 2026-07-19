#!/usr/bin/env node

import { Command } from "commander";
import { createArchive } from "./utils/archieve.js";
import fs from "node:fs";
import chalk from "chalk";

const program = new Command();

// Define the "deploy" command
program
    .name("aerocloud")
    .description("Deploy your application to aerocloud");

program
    .command("deploy")
    .action(async () => {
        console.log("Deploying your application to aerocloud...");

        // 1. get output dir of zip file
        const outputDirPath = await createArchive();

        // 2. Get output file buffer
        const outputFileBuffer = fs.readFileSync(outputDirPath);

        // 3. Set the Blob
        const fileBlob = new Blob([outputFileBuffer], { type: "application/zip" });

        // 4. Create Formdata & append fileBlob
        const formData = new FormData();
        formData.append('file', fileBlob, 'test.zip');

        // 5. Send the file using fetch post
        const response = await fetch("http://localhost:3000/deploy", {
            method: 'POST',
            body: formData, // Native fetch automically sets the boundaries
        });

        const result = await response.json();

        console.log(result);
        console.log("Deployment completed successfully!");
    });

program
    .command("list")
    .action(async () => {
        // Req on localhost:3000/list
        const response = await fetch("http://localhost:3000/list", {
            method: "GET"
        });

        // Check for response fail
        if (!response.ok) {
            console.error("Failed to fetch deployments list.");
        }

        const deployments = await response.json();

        deployments.forEach((dep: any) => {
            const formattedDate = new Date(dep.deployedAt.toLocaleString("en-US", {
                dateStyle: 'short',
                timeStyle: 'short'
            }));
            console.log(chalk.italic.bold(`- Subdomain: ${dep.subDomain} | Deployed: ${formattedDate}`));
        })
    })

// Parse the command-line arguments
program.parse(process.argv);