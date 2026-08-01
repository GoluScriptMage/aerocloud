import { describe, it, expect, vi, beforeEach } from "vitest";

// better-sqlite3 is a native module; mock it entirely so tests never touch
// a real database file on disk.
const { mockDb, DatabaseCtor } = vi.hoisted(() => {
    const mockDb = {
        exec: vi.fn(),
        prepare: vi.fn(),
    };
    const DatabaseCtor = vi.fn(function (this: any) {
        return mockDb;
    });
    return { mockDb, DatabaseCtor };
});

vi.mock("better-sqlite3", () => ({
    default: DatabaseCtor,
}));

import db, {
    saveDeployment,
    getDeployment,
    updateDeployment,
    getAllDeployments,
    deleteDeployment,
} from "./db.js";

describe("db config module", () => {
    beforeEach(() => {
        // Note: exec()/prepare() calls made at module-load time (table
        // creation) happened once when the module was first imported, so we
        // only clear call history that individual tests set up themselves.
        mockDb.prepare.mockReset();
    });

    it("opens the sqlite database and ensures the deployments table exists", () => {
        expect(DatabaseCtor).toHaveBeenCalledWith("aerocloud.db");
        expect(mockDb.exec).toHaveBeenCalledWith(
            expect.stringContaining("CREATE TABLE IF NOT EXISTS deployments")
        );
    });

    it("exports the underlying database instance as the default export", () => {
        expect(db).toBe(mockDb);
    });

    describe("saveDeployment", () => {
        it("inserts a new deployment row with the given values", () => {
            const runMock = vi.fn();
            mockDb.prepare.mockReturnValue({ run: runMock });

            saveDeployment("abc123", 4000, "deploying");

            expect(mockDb.prepare).toHaveBeenCalledWith(
                "INSERT INTO deployments (subdomain, port, status) VALUES (?, ?, ?)"
            );
            expect(runMock).toHaveBeenCalledWith("abc123", 4000, "deploying");
        });
    });

    describe("getDeployment", () => {
        it("selects a deployment by subdomain", () => {
            const getMock = vi.fn().mockReturnValue({ subdomain: "abc123", status: "deployed" });
            mockDb.prepare.mockReturnValue({ get: getMock });

            const result = getDeployment("abc123");

            expect(mockDb.prepare).toHaveBeenCalledWith(
                "SELECT * FROM deployments WHERE subdomain = ?"
            );
            expect(getMock).toHaveBeenCalledWith("abc123");
            expect(result).toEqual({ subdomain: "abc123", status: "deployed" });
        });

        it("returns undefined when no matching deployment exists", () => {
            const getMock = vi.fn().mockReturnValue(undefined);
            mockDb.prepare.mockReturnValue({ get: getMock });

            expect(getDeployment("missing")).toBeUndefined();
        });
    });

    describe("updateDeployment", () => {
        it("updates containerId, status and port for the given subdomain", () => {
            const runMock = vi.fn();
            mockDb.prepare.mockReturnValue({ run: runMock });

            updateDeployment("abc123", "deployed", "container-1", 5001);

            expect(mockDb.prepare).toHaveBeenCalledWith(
                "UPDATE deployments SET containerId = ?, status = ?, port = ? WHERE subdomain = ?"
            );
            expect(runMock).toHaveBeenCalledWith("container-1", "deployed", 5001, "abc123");
        });

        it("allows omitting the optional port argument", () => {
            const runMock = vi.fn();
            mockDb.prepare.mockReturnValue({ run: runMock });

            updateDeployment("abc123", "failed", "container-1");

            expect(runMock).toHaveBeenCalledWith("container-1", "failed", undefined, "abc123");
        });
    });

    describe("getAllDeployments", () => {
        it("returns all rows from the deployments table", () => {
            const allMock = vi.fn().mockReturnValue([{ subdomain: "a" }, { subdomain: "b" }]);
            mockDb.prepare.mockReturnValue({ all: allMock });

            const result = getAllDeployments();

            expect(mockDb.prepare).toHaveBeenCalledWith("SELECT * FROM deployments");
            expect(result).toEqual([{ subdomain: "a" }, { subdomain: "b" }]);
        });

        it("returns an empty array when there are no deployments", () => {
            const allMock = vi.fn().mockReturnValue([]);
            mockDb.prepare.mockReturnValue({ all: allMock });

            expect(getAllDeployments()).toEqual([]);
        });
    });

    describe("deleteDeployment", () => {
        it("deletes a deployment by subdomain", () => {
            const runMock = vi.fn();
            mockDb.prepare.mockReturnValue({ run: runMock });

            deleteDeployment("abc123");

            expect(mockDb.prepare).toHaveBeenCalledWith(
                "DELETE FROM deployments WHERE subdomain = ?"
            );
            expect(runMock).toHaveBeenCalledWith("abc123");
        });
    });
});