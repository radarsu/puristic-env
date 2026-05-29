import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { envFile } from "./envFile.js";

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "puristic-"));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe("envFile source", () => {
    it("returns {} when the file is missing", () => {
        expect(envFile(join(dir, "missing.env")).load({ schema: z.object({ host: z.string() }) })).toEqual({});
    });

    it("derives SCREAMING_SNAKE names from camelCase schema paths", () => {
        const path = join(dir, ".env");
        writeFileSync(path, "NODE_ENV=production\nHOST=localhost\nIGNORED=x\n");
        const schema = z.object({ nodeEnv: z.string(), host: z.string() });
        expect(envFile(path).load({ schema })).toEqual({ nodeEnv: "production", host: "localhost" });
    });

    it("ignores blank lines and comments", () => {
        const path = join(dir, ".env");
        writeFileSync(path, "# comment\n\nKEY=value\n  # indented comment\n");
        const schema = z.object({ key: z.string() });
        expect(envFile(path).load({ schema })).toEqual({ key: "value" });
    });

    it("strips surrounding double and single quotes", () => {
        const path = join(dir, ".env");
        writeFileSync(path, "DOUBLE=\"quoted\"\nSINGLE='quoted'\nUNQUOTED=plain\n");
        const schema = z.object({ double: z.string(), single: z.string(), unquoted: z.string() });
        expect(envFile(path).load({ schema })).toEqual({ double: "quoted", single: "quoted", unquoted: "plain" });
    });

    it("joins nested paths with single underscore", () => {
        const path = join(dir, ".env");
        writeFileSync(path, "SERVER_PORT=8080\nSERVER_HOST=0.0.0.0\n");
        const schema = z.object({ server: z.object({ port: z.string(), host: z.string() }) });
        expect(envFile(path).load({ schema })).toEqual({ server: { port: "8080", host: "0.0.0.0" } });
    });

    it("name includes the path", () => {
        const path = join(dir, "x.env");
        expect(envFile(path).name).toBe(`envFile(${path})`);
    });
});
