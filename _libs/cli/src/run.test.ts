import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { encrypt, generateKeypair } from "@confederation/core/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRunEnv, shellQuote, spawnEnv } from "./run.js";

const fixtureConfig = fileURLToPath(new URL("../../vscode/fixtures/api/confederation.config.ts", import.meta.url));
const savedPrivateKey = process.env["CONFEDERATION_PRIVATE_KEY"];

let dir: string;
let keypair: { publicKey: string; privateKey: string };

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "confederation-run-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "run-test" }));
    keypair = generateKeypair();
    process.env["CONFEDERATION_PRIVATE_KEY"] = keypair.privateKey;
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedPrivateKey === undefined) {
        delete process.env["CONFEDERATION_PRIVATE_KEY"];
    } else {
        process.env["CONFEDERATION_PRIVATE_KEY"] = savedPrivateKey;
    }
});

describe("resolveRunEnv", () => {
    it("merges .env then .env.local, with the local file overriding", async () => {
        writeFileSync(join(dir, ".env"), "A=1\nB=base\n");
        writeFileSync(join(dir, ".env.local"), "B=local\nC=3\n");
        const env = await resolveRunEnv({ cwd: dir, ambient: {} });
        expect(env).toEqual({ A: "1", B: "local", C: "3" });
    });

    it("loads an explicit --env file instead of the defaults", async () => {
        writeFileSync(join(dir, ".env"), "A=default\n");
        writeFileSync(join(dir, "custom.env"), "A=custom\n");
        const env = await resolveRunEnv({ cwd: dir, ambient: {}, envFiles: ["custom.env"] });
        expect(env).toEqual({ A: "custom" });
    });

    it("decrypts an encrypted secret value with the configured private key", async () => {
        writeFileSync(join(dir, ".env"), `DATABASE_URL=${encrypt("postgres://secret", keypair.publicKey)}\n`);
        const env = await resolveRunEnv({ cwd: dir, ambient: {} });
        expect(env["DATABASE_URL"]).toBe("postgres://secret");
    });

    it("expands references against sibling values and the ambient environment", async () => {
        writeFileSync(join(dir, ".env"), "HOST=localhost\nURL=http://${HOST}:${PORT}/db\n");
        const env = await resolveRunEnv({ cwd: dir, ambient: { PORT: "5432" } });
        expect(env["URL"]).toBe("http://localhost:5432/db");
    });

    it("injects schema defaults only with --defaults and never over the ambient environment", async () => {
        writeFileSync(join(dir, ".env"), "NODE_ENV=test\n");

        const without = await resolveRunEnv({ cwd: dir, ambient: {}, configPath: fixtureConfig });
        expect(without["SERVER_HOST"]).toBeUndefined();

        const withDefaults = await resolveRunEnv({ cwd: dir, ambient: {}, configPath: fixtureConfig, defaults: true });
        expect(withDefaults["SERVER_HOST"]).toBe("0.0.0.0");

        const overridden = await resolveRunEnv({ cwd: dir, ambient: { SERVER_HOST: "10.0.0.1" }, configPath: fixtureConfig, defaults: true });
        expect(overridden["SERVER_HOST"]).toBeUndefined();
    });

    it("warns and skips defaults when --defaults is set but no config is found", async () => {
        writeFileSync(join(dir, ".env"), "A=1\n");
        const warnings: string[] = [];
        const env = await resolveRunEnv({ cwd: dir, ambient: {}, defaults: true, onWarn: (message) => warnings.push(message) });
        expect(env).toEqual({ A: "1" });
        expect(warnings[0]).toContain("no confederation.config.*");
    });
});

describe("spawnEnv", () => {
    it("injects the resolved env into the child and forwards its exit code", async () => {
        const code = await spawnEnv(process.execPath, ["-e", "process.exit(Number(process.env.CODE))"], { CODE: "7" }, dir);
        expect(code).toBe(7);
    });

    it("rejects when the command cannot be spawned", async () => {
        await expect(spawnEnv("confederation-no-such-binary", [], {}, dir)).rejects.toThrow();
    });
});

describe("shellQuote", () => {
    it("single-quotes a plain value", () => {
        expect(shellQuote("postgres://localhost/db")).toBe("'postgres://localhost/db'");
    });

    it("escapes embedded single quotes", () => {
        expect(shellQuote("a'b")).toBe("'a'\\''b'");
    });
});
