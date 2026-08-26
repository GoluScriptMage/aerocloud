export interface DeployOptions {
    subDomain: string;
    targetDir: string;
    envVars?: string;
    userId: string;
    onLog: (message: string) => void;
}

export async function deployEngine(options: DeployOptions): Promise<{ port: number; url: string }> {
    return { port: 0, url: "" };
}