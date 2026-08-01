import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import path from "node:path";

const { lastArchiveInstance, ZipArchiveCtor } = vi.hoisted(() => {
    const state: { instance: any } = { instance: null };
    const ZipArchiveCtor = vi.fn().mockImplementation((opts: any) => {
        state.instance = {
            _opts: opts,
            pipe: vi.fn(),
            glob: vi.fn(),
            finalize: vi.fn(),
        };
        return state.instance;
    });
    return { lastArchiveInstance: state, ZipArchiveCtor };
});

vi.mock("archiver", () => ({
    ZipArchive: ZipArchiveCtor,
}));

vi.mock("node:fs", () => {
    const existsSync = vi.fn();
    const createWriteStream = vi.fn();
    return {
        default: { existsSync, createWriteStream },
        existsSync,
        createWriteStream,
    };
});

vi.mock("./configHelper.js", () => ({
    readConfigFile: vi.fn(),
    runBuildCommandIfExists: vi.fn(),
}));

vi.mock("./logger.js", () => ({
    Logger: {
        info: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

import fs from "node:fs";
import { readConfigFile, runBuildCommandIfExists } from "./configHelper.js";
import { Logger } from "./logger.js";
import { createArchive } from "./archieve.js";

describe("createArchive", () => {
    let fakeOutputStream: EventEmitter;

    beforeEach(() => {
        vi.clearAllMocks();
        fakeOutputStream = new EventEmitter();
        (fs.createWriteStream as any).mockReturnValue(fakeOutputStream);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resolves with the archive path once the output stream closes", async () => {
        (readConfigFile as any).mockReturnValue(".");
        (fs.existsSync as any).mockReturnValue(true);

        const promise = createArchive();
        fakeOutputStream.emit("close");
        const result = await promise;

        const expectedPath = path.join(process.cwd(), "test.zip");
        expect(result).toBe(expectedPath);
        expect(Logger.success).toHaveBeenCalledWith(
            expect.stringContaining(expectedPath)
        );
    });

    it("creates the archive with maximum zlib compression", async () => {
        (readConfigFile as any).mockReturnValue(".");
        (fs.existsSync as any).mockReturnValue(true);

        const promise = createArchive();
        fakeOutputStream.emit("close");
        await promise;

        expect(ZipArchiveCtor).toHaveBeenCalledWith({ zlib: { level: 9 } });
    });

    it("runs the configured build command before validating the build directory", async () => {
        (readConfigFile as any).mockReturnValue(".");
        (fs.existsSync as any).mockReturnValue(true);

        const promise = createArchive();
        fakeOutputStream.emit("close");
        await promise;

        expect(runBuildCommandIfExists).toHaveBeenCalledTimes(1);
    });

    it("globs files from the configured publish directory, ignoring node_modules/dist/test.zip", async () => {
        (readConfigFile as any).mockReturnValue("build");
        (fs.existsSync as any).mockReturnValue(true);

        const promise = createArchive();
        fakeOutputStream.emit("close");
        await promise;

        const archiveInstance = lastArchiveInstance.instance;
        expect(archiveInstance.glob).toHaveBeenCalledWith(
            "**/*",
            expect.objectContaining({
                cwd: "build",
                ignore: expect.arrayContaining(["node_modules/**", "dist/**", "test.zip"]),
                dot: true,
            })
        );
        expect(archiveInstance.finalize).toHaveBeenCalledTimes(1);
    });

    it("falls back to '.' as the publish directory when none is configured", async () => {
        (readConfigFile as any).mockReturnValue(null);
        (fs.existsSync as any).mockReturnValue(true);

        const promise = createArchive();
        fakeOutputStream.emit("close");
        await promise;

        const archiveInstance = lastArchiveInstance.instance;
        expect(archiveInstance.glob).toHaveBeenCalledWith(
            "**/*",
            expect.objectContaining({ cwd: "." })
        );
    });

    it("rejects and logs an error when the build directory does not exist", async () => {
        (readConfigFile as any).mockReturnValue("missing-dir");
        (fs.existsSync as any).mockReturnValue(false);

        await expect(createArchive()).rejects.toThrow(
            "Build directory 'missing-dir' does not exist."
        );

        expect(Logger.error).toHaveBeenCalledWith(
            expect.stringContaining("missing-dir")
        );

        const archiveInstance = lastArchiveInstance.instance;
        expect(archiveInstance.finalize).not.toHaveBeenCalled();
        expect(archiveInstance.glob).not.toHaveBeenCalled();
    });
});