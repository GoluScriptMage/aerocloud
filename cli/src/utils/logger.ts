import chalk from "chalk";
import { inspect } from "util";

export class Logger {
    private static formatMessage(message: any): string {
        if (typeof message === "object") {
            // util.inspect is safer than JSON.stringify for circular references
            return inspect(message, { colors: true, depth: null });
        }
        return message;
    }

    // Getter for timestamp
    private static get timestamp(): string {
        return new Date().toLocaleTimeString();
    }

    // Logging methods

    static info(message: any): void {
        console.log(`${chalk.gray(this.timestamp)} ${chalk.blueBright.bold("[INFO]")} ${this.formatMessage(message)}`);
    }

    static success(message: any): void {
        console.log(`${chalk.gray(this.timestamp)} ${chalk.greenBright.bold("[SUCCESS]")} ${this.formatMessage(message)}`);
    }

    static error(message: any): void {
        console.error(`${chalk.gray(this.timestamp)} ${chalk.redBright.bold("[ERROR]")} ${this.formatMessage(message)}`);
    }

    static warn(message: any): void {
        console.warn(`${chalk.gray(this.timestamp)} ${chalk.yellowBright.bold("[WARN]")} ${this.formatMessage(message)}`);
    }

    static debug(message: any): void {
        console.log(`${chalk.gray(this.timestamp)} ${chalk.magentaBright.bold("[DEBUG]")} ${this.formatMessage(message)}`);
    }

    static log(message: any): void {
        console.log(`${chalk.dim(this.formatMessage(message))}`);
        // console.log(`${chalk.gray(this.timestamp)} ${chalk.whiteBright.bold("[LOG]")} ${this.formatMessage(message)}`);
    }

}