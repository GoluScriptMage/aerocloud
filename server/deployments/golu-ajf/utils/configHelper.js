import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { execSync } from 'child_process';
// Function to initialize the aerocloud configuration file
export function initConfigFile() {
    const fileName = 'aerocloud.json';
    const data = {
        name: '',
        _comment: 'This is default config file for deployment. You can change the name to what u want. This name will be used as sub-domain for your deployment. e.g. http://<name>.localhost:8080',
        publish: './dist',
        _comment_publish: 'Path to the build directory containing the files to be published',
        buildCommand: '',
        _comment_buildCommand: 'Optional: Command to build your project before deployment. If specified, this command will be executed before creating the archive for deployment.'
    };
    // Check if file exists
    const targetFilePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(targetFilePath)) {
        fs.writeFileSync(targetFilePath, JSON.stringify(data, null, 4), 'utf-8');
    }
    console.log(chalk.blue.italic(`Config file '${fileName}' has been initialized in the current directory.`));
}
// Function to read the aerocloud configuration file
export function readConfigFile(params) {
    const targetFilePath = path.join(process.cwd(), 'aerocloud.json');
    if (!fs.existsSync(targetFilePath)) {
        console.log(chalk.red.italic(`Config file 'aerocloud.json' not found in the current directory.`));
        return null;
    }
    const configData = JSON.parse(fs.readFileSync(targetFilePath, 'utf-8'));
    if (params) {
        return configData[params];
    }
    return configData;
}
// Function to run the build command if it exists in the configuration file
export function runBuildCommandIfExists() {
    const buildCommand = readConfigFile('buildCommand');
    if (buildCommand) {
        console.log(chalk.blue.italic(`Executing build command: ${buildCommand}`));
        try {
            // Execute the build command
            execSync('npm run build', { stdio: 'inherit', shell: true });
            console.log(chalk.green.italic('Build command executed successfully.'));
        }
        catch (error) {
            console.error(chalk.red.italic('Error executing build command:'));
            process.exit(1); // Exit the process with an error code
        }
    }
}
