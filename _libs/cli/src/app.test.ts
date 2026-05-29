import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decrypt, PUBLIC_KEY_PATH } from "@confederation/core/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "./app.js";

interface FakeProcess {
    stdout: { write: (chunk: string) => boolean };
    stderr: { write: (chunk: string) => boolean };
    env: Readonly<Record<string, string | undefined>>;
    exitCode?: number;
    stdoutText: string;
    stderrText: string;
}

function fakeProcess(): FakeProcess {
    const fake: FakeProcess = {
        stdoutText: "",
        stderrText: "",
        env: process.env,
        stdout: {
            write(chunk: string) {
                fake.stdoutText += chunk;
                return true;
            },
        },
        stderr: {
            write(chunk: string) {
                fake.stderrText += chunk;
                return true;
            },
        },
    };
    return fake;
}

let dir: string;
let originalCwd: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "confederation-cli-app-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app-smoke-test" }));
    originalCwd = process.cwd();
    process.chdir(dir);
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
});

describe("app", () => {
    it("keygen writes the public key file and prints the expected lines", async () => {
        const fake = fakeProcess();
        const { run } = await import("@stricli/core");
        await run(app, ["keygen"], { process: fake });
        expect(existsSync(join(dir, PUBLIC_KEY_PATH))).toBe(true);
        expect(fake.stdoutText).toContain("Public key written to");
        expect(fake.stdoutText).toContain("Project: app-smoke-test");
        expect(fake.stdoutText).toContain("Private key (do NOT commit");
        expect(fake.stdoutText).toContain("CONFEDERATION_PRIVATE_KEY env var");
    });

    it("encrypt prints an envelope that round-trips through decrypt()", async () => {
        const { run } = await import("@stricli/core");
        const keygenOutput = fakeProcess();
        await run(app, ["keygen"], { process: keygenOutput });
        const privateKey = keygenOutput.stdoutText
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.length > 100 && !/\s/.test(l));
        if (privateKey === undefined) {
            throw new Error("could not locate private key in keygen output");
        }

        const encryptOutput = fakeProcess();
        await run(app, ["encrypt", "my-secret-value"], { process: encryptOutput });
        const envelope = encryptOutput.stdoutText.trim();
        expect(envelope.startsWith("encrypted:v1:")).toBe(true);
        expect(decrypt(envelope, privateKey)).toBe("my-secret-value");
    });

    it("encrypt with no positional sets a non-zero exit code", async () => {
        const fake = fakeProcess();
        const { run } = await import("@stricli/core");
        await run(app, ["encrypt"], { process: fake });
        expect(fake.exitCode).not.toBe(0);
        expect(fake.exitCode).toBeDefined();
    });

    it("--help lists the subcommands", async () => {
        const fake = fakeProcess();
        const { run } = await import("@stricli/core");
        await run(app, ["--help"], { process: fake });
        const combined = fake.stdoutText + fake.stderrText;
        expect(combined).toContain("keygen");
        expect(combined).toContain("encrypt");
        expect(combined).toContain("validate");
        expect(combined).toContain("run");
    });

    it("validate exits cleanly when there is nothing to validate", async () => {
        const fake = fakeProcess();
        const { run } = await import("@stricli/core");
        await run(app, ["validate"], { process: fake });
        expect(fake.stdoutText).toContain("No .env files found.");
        expect(fake.exitCode ?? 0).toBe(0);
    });

    it("run with no command (and no --print) sets a non-zero exit code", async () => {
        const fake = fakeProcess();
        const { run } = await import("@stricli/core");
        await run(app, ["run"], { process: fake });
        expect(fake.stderrText).toContain("No command to run");
        expect(fake.exitCode).toBe(1);
    });

    it("run passes the command after -- through verbatim and forwards its exit code", async () => {
        const fake = fakeProcess();
        const { run } = await import("@stricli/core");
        await run(app, ["run", "--", process.execPath, "-e", "process.exit(3)"], { process: fake });
        expect(fake.exitCode).toBe(3);
    });
});
