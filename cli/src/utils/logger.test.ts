import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "./logger.js";

describe("Logger", () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("info", () => {
        it("logs to console.log with the [INFO] tag and message", () => {
            Logger.info("Deploying your application to aerocloud...");

            expect(logSpy).toHaveBeenCalledTimes(1);
            const output = logSpy.mock.calls[0][0] as string;
            expect(output).toContain("[INFO]");
            expect(output).toContain("Deploying your application to aerocloud...");
        });

        it("does not write to console.error or console.warn", () => {
            Logger.info("hello");
            expect(errorSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
        });
    });

    describe("success", () => {
        it("logs to console.log with the [SUCCESS] tag and message", () => {
            Logger.success("Archive created successfully");

            expect(logSpy).toHaveBeenCalledTimes(1);
            const output = logSpy.mock.calls[0][0] as string;
            expect(output).toContain("[SUCCESS]");
            expect(output).toContain("Archive created successfully");
        });
    });

    describe("error", () => {
        it("logs to console.error with the [ERROR] tag and message", () => {
            Logger.error("Build directory does not exist.");

            expect(errorSpy).toHaveBeenCalledTimes(1);
            const output = errorSpy.mock.calls[0][0] as string;
            expect(output).toContain("[ERROR]");
            expect(output).toContain("Build directory does not exist.");
        });

        it("does not write to console.log", () => {
            Logger.error("boom");
            expect(logSpy).not.toHaveBeenCalled();
        });
    });

    describe("warn", () => {
        it("logs to console.warn with the [WARN] tag and message", () => {
            Logger.warn("This is a warning");

            expect(warnSpy).toHaveBeenCalledTimes(1);
            const output = warnSpy.mock.calls[0][0] as string;
            expect(output).toContain("[WARN]");
            expect(output).toContain("This is a warning");
        });
    });

    describe("message formatting", () => {
        it("formats plain string messages as-is", () => {
            Logger.info("plain string");
            const output = logSpy.mock.calls[0][0] as string;
            expect(output).toContain("plain string");
        });

        it("formats object messages using util.inspect instead of [object Object]", () => {
            Logger.info({ status: "success", subdomain: "5ca393" });

            const output = logSpy.mock.calls[0][0] as string;
            expect(output).not.toContain("[object Object]");
            expect(output).toContain("status");
            expect(output).toContain("5ca393");
        });

        it("formats array messages using util.inspect", () => {
            Logger.info([{ subDomain: "abc" }, { subDomain: "def" }]);

            const output = logSpy.mock.calls[0][0] as string;
            expect(output).toContain("abc");
            expect(output).toContain("def");
        });

        it("handles null messages without throwing (typeof null === 'object' edge case)", () => {
            expect(() => Logger.info(null)).not.toThrow();
            const output = logSpy.mock.calls[0][0] as string;
            expect(output).toContain("null");
        });

        it("handles numeric messages by returning them unformatted", () => {
            Logger.info(42 as unknown as string);
            const output = logSpy.mock.calls[0][0] as string;
            expect(output).toContain("42");
        });
    });

    it("includes a timestamp segment in every log line", () => {
        Logger.info("with timestamp");
        const output = logSpy.mock.calls[0][0] as string;
        // A locale time string typically contains at least one colon (HH:MM(:SS))
        expect(output).toMatch(/:/);
    });
});