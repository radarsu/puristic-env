import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt, encrypt, generateKeypair, isEnvelope, PUBLIC_KEY_PATH } from "@puristic/env/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt as decryptCli } from "./decrypt.js";
import { encryptAll } from "./encryptAll.js";
import { rotate } from "./rotate.js";

const fixtureConfig = fileURLToPath(new URL("../../vscode/fixtures/api/env.config.ts", import.meta.url));
const savedPrivateKey = process.env["PURISTIC_PRIVATE_KEY"];

let dir: string;
let keypair: { publicKey: string; privateKey: string };

function envValue(envPath: string, key: string): string {
    const line = readFileSync(envPath, "utf8")
        .split("\n")
        .find((candidate) => candidate.startsWith(`${key}=`));
    if (line === undefined) {
        throw new Error(`no ${key} in ${envPath}`);
    }
    return line.slice(`${key}=`.length);
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "puristic-secrets-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "secrets-test" }));
    keypair = generateKeypair();
    mkdirSync(join(dir, ".config"), { recursive: true });
    writeFileSync(join(dir, PUBLIC_KEY_PATH), `${keypair.publicKey}\n`);
    process.env["PURISTIC_PRIVATE_KEY"] = keypair.privateKey;
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedPrivateKey === undefined) {
        delete process.env["PURISTIC_PRIVATE_KEY"];
    } else {
        process.env["PURISTIC_PRIVATE_KEY"] = savedPrivateKey;
    }
});

describe("encrypt-all", () => {
    it("encrypts only plaintext secret-marked values, preserving the rest, and is idempotent", async () => {
        const envPath = join(dir, ".env");
        writeFileSync(envPath, "# header\nSERVER_PORT=3000\nDATABASE_URL=postgres://plain\n");

        const result = await encryptAll({ envFiles: [envPath], config: fixtureConfig, cwd: dir });
        expect(result.files[0]?.encrypted).toBe(1);

        const text = readFileSync(envPath, "utf8");
        expect(text).toContain("# header");
        expect(text).toContain("SERVER_PORT=3000");
        const envelope = envValue(envPath, "DATABASE_URL");
        expect(isEnvelope(envelope)).toBe(true);
        expect(decrypt(envelope, keypair.privateKey)).toBe("postgres://plain");

        const second = await encryptAll({ envFiles: [envPath], config: fixtureConfig, cwd: dir });
        expect(second.files[0]?.encrypted).toBe(0);
    });
});

describe("rotate", () => {
    it("re-encrypts secrets to a fresh keypair and replaces the public key", () => {
        const envPath = join(dir, ".env");
        writeFileSync(envPath, `DATABASE_URL=${encrypt("s3cret", keypair.publicKey)}\n`);

        const result = rotate({ envFiles: [envPath], cwd: dir });
        expect(result.files[0]?.reEncrypted).toBe(1);

        expect(readFileSync(join(dir, PUBLIC_KEY_PATH), "utf8").trim()).not.toBe(keypair.publicKey);
        expect(decrypt(envValue(envPath, "DATABASE_URL"), result.privateKey)).toBe("s3cret");
    });
});

describe("decrypt", () => {
    it("decrypts an envelope with the configured private key", () => {
        expect(decryptCli(encrypt("hello", keypair.publicKey))).toBe("hello");
    });
});
