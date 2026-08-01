import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

// Captures the action callback registered for each commander subcommand
// (e.g. "init", "deploy", "list") so we can invoke them directly without
// going through commander's real argv parsing (which would call
// process.exit on unmatched commands during a test run).
const { commandActions } = vi.hoisted(() => {
    return { commandActions: {} as Record<string, (...args: any[]) => any> };
});

vi.mock("commander", () => {
    class FakeCommand {
        private currentName?: string;
        name(_n?: string) {
            return this;
        }
        description(_d?: string) {
            return this;
        }
        command(name: string) {
            this.currentName = name;
            return this;
        }
        action(fn: (...args: any[]) => any) {
            if (this.currentName) {
                commandActions[this.currentName] = fn;
            }
            return this;
        }
        parse(_argv?: string[]) {
            return this;
        }
    }
    return { Command: FakeCommand };
});

vi.mock("./utils/logger.js", () => ({
    Logger: {
        info: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock("./utils/archieve.js", () => ({
    createArchive: vi.fn(),
}));

vi.mock("./utils/configHelper.js", () => ({
    initConfigFile: vi.fn(),
    readConfigFile: vi.fn(),
}));

vi.mock("node:fs", () => {
    const readFileSync = vi.fn();
    return { default: { readFileSync }, readFileSync };
});

import fs from "node:fs";
import { Logger } from "./utils/logger.js";
import { createArchive } from "./utils/archieve.js";
import { initConfigFile, readConfigFile } from "./utils/configHelper.js";

describe("cli index commands", () => {
    beforeAll(async () => {
        // Importing the module registers the "init"/"deploy"/"list" actions
        // into commandActions via the mocked commander.Command above.
        await import("./index.js");
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("registers the init, deploy and list commands", () => {
        expect(commandActions.init).toBeTypeOf("function");
        expect(commandActions.deploy).toBeTypeOf("function");
        expect(commandActions.list).toBeTypeOf("function");
    });

    describe("init", () => {
        it("delegates to initConfigFile", () => {
            commandActions.init();
            expect(initConfigFile).toHaveBeenCalledTimes(1);
        });
    });

    describe("deploy", () => {
        it("archives, uploads and reports success", async () => {
            (createArchive as any).mockResolvedValue("/tmp/test.zip");
            (fs.readFileSync as any).mockReturnValue(Buffer.from("zip-contents"));
            (readConfigFile as any).mockReturnValue("my-app");

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ status: "success", subDomain: "my-app" }),
            });
            vi.stubGlobal("fetch", fetchMock);

            await commandActions.deploy();

            expect(Logger.info).toHaveBeenCalledWith(
                expect.stringContaining("Deploying your application to aerocloud...")
            );
            expect(createArchive).toHaveBeenCalledTimes(1);
            expect(fs.readFileSync).toHaveBeenCalledWith("/tmp/test.zip");
            expect(readConfigFile).toHaveBeenCalledWith("name");

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, options] = fetchMock.mock.calls[0];
            expect(url).toBe("http://localhost:3000/deploy");
            expect(options.method).toBe("POST");
            expect(options.body).toBeInstanceOf(FormData);
            expect(options.body.get("name")).toBe("my-app");

            expect(Logger.info).toHaveBeenCalledWith(
                expect.stringContaining("Deployment response")
            );
            expect(Logger.success).toHaveBeenCalledWith(
                "Deployment completed successfully!"
            );
        });
    });

    describe("list", () => {
        it("logs each deployment returned by the server", async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => [
                    { subDomain: "abc123", deployedAt: "2024-01-01T00:00:00.000Z" },
                    { subDomain: "def456", deployedAt: "2024-02-02T00:00:00.000Z" },
                ],
            });
            vi.stubGlobal("fetch", fetchMock);

            await commandActions.list();

            expect(fetchMock).toHaveBeenCalledWith(
                "http://localhost:3000/list",
                expect.objectContaining({ method: "GET" })
            );
            expect(Logger.info).toHaveBeenCalledWith(
                expect.stringContaining("abc123")
            );
            expect(Logger.info).toHaveBeenCalledWith(
                expect.stringContaining("def456")
            );
            expect(Logger.error).not.toHaveBeenCalled();
        });

        it("logs an error when the server responds with a failure status", async () => {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: false,
                json: async () => [],
            });
            vi.stubGlobal("fetch", fetchMock);

            await commandActions.list();

            expect(Logger.error).toHaveBeenCalledWith(
                "Failed to fetch deployments list."
            );
        });
    });
});