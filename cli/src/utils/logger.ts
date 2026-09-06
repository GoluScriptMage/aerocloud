import chalk from "chalk";
import { inspect } from "util";

/**
 * Safely parse server error responses checking Content-Type first
 * to avoid "SyntaxError: Unexpected token '<'" when receiving HTML.
 */
export async function parseServerError(response: Response): Promise<string> {
    try {
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();
        if (!text || !text.trim()) {
            return `Server returned status ${response.status} ${response.statusText || ""}`.trim();
        }

        const trimmed = text.trim();

        // If Content-Type indicates JSON or body starts with JSON delimiters, attempt JSON parse
        if (contentType.includes("application/json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                const data = JSON.parse(trimmed);
                if (typeof data === "string") return data;
                if (data && typeof data === "object") {
                    const err = data.error ?? data.message ?? data.err;
                    if (typeof err === "string") return err;
                    if (err && typeof err === "object") {
                        if (typeof (err as any).message === "string") return (err as any).message;
                        return JSON.stringify(err);
                    }
                    return JSON.stringify(data);
                }
                return String(data);
            } catch {
                // Not valid JSON, continue to HTML/plain text handling
            }
        }

        // If Express returned an HTML error page, extract meaningful message or title
        if (trimmed.includes("<html") || trimmed.includes("<!DOCTYPE") || trimmed.startsWith("<")) {
            const preMatch = trimmed.match(/<pre>(.*?)<\/pre>/is);
            if (preMatch && preMatch[1]) {
                return preMatch[1].replace(/<[^>]+>/g, "").trim();
            }
            const titleMatch = trimmed.match(/<title>(.*?)<\/title>/is);
            if (titleMatch && titleMatch[1]) {
                return `${response.status} ${response.statusText || 'Error'} (${titleMatch[1].trim()})`;
            }
            return `Server returned ${response.status} ${response.statusText || 'Error'}`;
        }

        return trimmed;
    } catch {
        // Fallback below if stream reading or parsing fails
    }
    return `Server returned status ${response.status} ${response.statusText || ""}`.trim();
}

export class Logger {
    static parseServerError = parseServerError;

    private static formatMessage(message: any): string {
        if (typeof message === "object" && message !== null) {
            return inspect(message, { colors: true, depth: null });
        }
        return String(message ?? "");
    }

    /**
     * Prints a clean, high-visibility header title
     */
    static header(title: string): void {
        console.log(`\n${chalk.cyan.bold("☁  " + title)}`);
    }

    /**
     * Logs an in-flight or completed step
     * e.g.   → Packaging source [48ms]
     */
    static step(msg: string, duration?: string): void {
        const dur = duration ? ` ${chalk.dim(duration)}` : "";
        console.log(`  ${chalk.cyan("→")} ${msg}${dur}`);
    }

    /**
     * Logs a success message
     * e.g.   ✓ Deployment successful [3.2s]
     */
    static success(msg: string, duration?: string): void {
        const dur = duration ? ` ${chalk.dim(duration)}` : "";
        console.log(`  ${chalk.green("✓")} ${chalk.green(msg)}${dur}`);
    }

    /**
     * Logs an error message, with optional server error detail
     * e.g.   ✖ Failed: <server error>
     */
    static error(msg: string, serverError?: string | Error): void {
        const errText = serverError instanceof Error ? serverError.message : serverError;
        const detail = errText ? `: ${chalk.red(errText)}` : "";
        console.error(`  ${chalk.red("✖")} ${chalk.red.bold(msg)}${detail}`);
    }

    /**
     * Logs a warning
     * e.g.   ⚠ No .env file found
     */
    static warn(msg: string): void {
        console.warn(`  ${chalk.yellow("⚠")} ${chalk.yellow(msg)}`);
    }

    /**
     * Backward-compatible info log without timestamps
     */
    static info(msg: any): void {
        console.log(`  ${chalk.blue("ℹ")} ${this.formatMessage(msg)}`);
    }

    /**
     * Backward-compatible debug log without timestamps
     */
    static debug(msg: any): void {
        console.log(`  ${chalk.dim("• " + this.formatMessage(msg))}`);
    }

    /**
     * Direct stdout log passthrough
     */
    static log(msg: any): void {
        console.log(this.formatMessage(msg));
    }

    /**
     * Timer helper using performance.now() returning formatted elapsed strings:
     * [42ms] or [1.8s]
     */
    static timer(): () => string;
    static timer(start: number): string;
    static timer(start?: number): (() => string) | string {
        if (typeof start === "number") {
            const ms = performance.now() - start;
            return Logger.formatDuration(ms);
        }
        const startTime = performance.now();
        return () => Logger.formatDuration(performance.now() - startTime);
    }

    static formatDuration(ms: number): string {
        if (ms < 1000) {
            return `[${Math.round(ms)}ms]`;
        }
        return `[${(ms / 1000).toFixed(1)}s]`;
    }

    /**
     * Formats and prints a clean tabular view for deployments
     */
    static table(headers: string[], rows: (string | number)[][]): void {
        if (!headers || headers.length === 0) return;

        const colWidths = headers.map((header, colIdx) => {
            const maxRowLen = rows.reduce((max, row) => {
                const cell = row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]) : "";
                return Math.max(max, cell.length);
            }, 0);
            return Math.max(header.length, maxRowLen);
        });

        const pad = (str: string, width: number) => str + " ".repeat(Math.max(0, width - str.length));

        // Header line
        const headerLine = headers.map((h, i) => pad(h, colWidths[i])).join("   ");
        console.log(`\n  ${chalk.bold.white(headerLine)}`);

        // Separator line
        const sepLine = colWidths.map(w => "─".repeat(w)).join("   ");
        console.log(`  ${chalk.dim(sepLine)}`);

        // Rows
        for (const row of rows) {
            const rowLine = row.map((cell, i) => {
                const val = cell !== undefined && cell !== null ? String(cell) : "";
                const paddedVal = pad(val, colWidths[i]);

                const colName = headers[i]?.toUpperCase();
                if (colName === "STATUS") {
                    const lower = val.toLowerCase();
                    if (lower === "running" || lower === "online" || lower === "active" || lower === "deployed") {
                        return chalk.green(paddedVal);
                    }
                    if (lower === "stopped" || lower === "paused" || lower === "deploying") {
                        return chalk.yellow(paddedVal);
                    }
                    if (lower === "failed" || lower === "error" || lower === "crashed" || lower === "down" || lower === "exited") {
                        return chalk.red(paddedVal);
                    }
                    return chalk.dim(paddedVal);
                }
                if (colName === "URL") {
                    return chalk.cyan(paddedVal);
                }
                if (colName === "SUBDOMAIN") {
                    return chalk.bold.white(paddedVal);
                }
                return chalk.dim(paddedVal);
            }).join("   ");

            console.log(`  ${rowLine}`);
        }
        console.log();
    }
}