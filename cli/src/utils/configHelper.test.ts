import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";

vi.mock("fs");
vi.mock("child_process");
vi.mock("./logger.js", () => ({
    Logger: {
        info: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

import fs from "fs";
import { execSync } from "child_process";
import { Logger } from "./logger.js";
import { initConfigFile, readConfigFile, runBuildCommandIfExists } from "./configHelper.js";

const FAKE_CWD = "/fake/project";

describe("configHelper", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process, "cwd").mockReturnValue(FAKE_CWD);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("initConfigFile", () => {
        it("writes a default config file when it does not already exist", () => {
            (fs.existsSync as any).mockReturnValue(false);

            initConfigFile();

            const expectedPath = path.join(FAKE_CWD, "aerocloud.json");
            expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
            const [writtenPath, writtenContent, encoding] = (fs.writeFileSync as any).mock.calls[0];
            expect(writtenPath).toBe(expectedPath);
            expect(encoding).toBe("utf-8");

            const parsed = JSON.parse(writtenContent);
            expect(parsed).toMatchObject({
                name: "",
                publish: ".",
                buildCommand: "",
            });

            expect(Logger.success).toHaveBeenCalledTimes(1);
            expect(Logger.success).toHaveBeenCalledWith(
                expect.stringContaining("aerocloud.json")
            );
        });

        it("does not overwrite an existing config file", () => {
            (fs.existsSync as any).mockReturnValue(true);

            initConfigFile();

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            // Success message is still logged regardless of whether a new file was written
            expect(Logger.success).toHaveBeenCalledTimes(1);
        });
    });

    describe("readConfigFile", () => {
        it("logs an error and returns null when the config file is missing", () => {
            (fs.existsSync as any).mockReturnValue(false);

            const result = readConfigFile();

            expect(result).toBeNull();
            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringContaining("aerocloud.json")
            );
            expect(fs.readFileSync).not.toHaveBeenCalled();
        });

        it("returns the full parsed config when no params are provided", () => {
            const configObj = { name: "my-app", publish: "dist", buildCommand: "npm run build" };
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify(configObj));

            const result = readConfigFile();

            expect(result).toEqual(configObj);
        });

        it("returns a specific field when a param is provided", () => {
            const configObj = { name: "my-app", publish: "dist", buildCommand: "" };
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify(configObj));

            expect(readConfigFile("publish")).toBe("dist");
            expect(readConfigFile("name")).toBe("my-app");
        });

        it("returns undefined for a param that does not exist on the config", () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify({ name: "my-app" }));

            expect(readConfigFile("doesNotExist")).toBeUndefined();
        });

        it("throws when the config file contains invalid JSON", () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue("{ not valid json");

            expect(() => readConfigFile()).toThrow();
        });
    });

    describe("runBuildCommandIfExists", () => {
        it("does nothing when no buildCommand is configured", () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(JSON.stringify({ buildCommand: "" }));

            runBuildCommandIfExists();

            expect(execSync).not.toHaveBeenCalled();
            expect(Logger.info).not.toHaveBeenCalled();
        });

        it("executes the configured build command", () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(
                JSON.stringify({ buildCommand: "npm run build" })
            );

            runBuildCommandIfExists();

            expect(Logger.info).toHaveBeenCalledWith(
                expect.stringContaining("npm run build")
            );
            expect(execSync).toHaveBeenCalledWith("npm run build", {
                stdio: "inherit",
                shell: true,
            });
        });

        it("logs an error and exits the process when the build command fails", () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue(
                JSON.stringify({ buildCommand: "npm run build" })
            );
            (execSync as any).mockImplementation(() => {
                throw new Error("build failed");
            });
            const exitSpy = vi
                .spyOn(process, "exit")
                .mockImplementation((() => undefined) as unknown as (code?: number) => never);

            runBuildCommandIfExists();

            expect(Logger.error).toHaveBeenCalledWith(
                expect.stringContaining("Error executing build command")
            );
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });
});