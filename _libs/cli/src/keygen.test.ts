import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decrypt as decryptValue, encrypt as encryptValue, PUBLIC_KEY_PATH } from "@puristic/env/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encrypt } from "./encrypt.js";
import { keygen } from "./keygen.js";

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "puristic-cli-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "cli-test-project" }));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe("keygen", () => {
    it("writes the public key file and returns a usable private key", () => {
        const result = keygen(dir);
        expect(existsSync(join(dir, PUBLIC_KEY_PATH))).toBe(true);
        expect(result.publicKeyPath.endsWith(PUBLIC_KEY_PATH)).toBe(true);
        expect(result.projectName).toBe("cli-test-project");
        expect(result.privateKey.length).toBeGreaterThan(100);
    });

    it("refuses to overwrite an existing public key", () => {
        keygen(dir);
        expect(() => keygen(dir)).toThrow(/Refusing to overwrite/);
    });

    it("encrypt subcommand round-trips through decrypt with the generated key", () => {
        const { privateKey } = keygen(dir);
        const envelope = encrypt("api-secret", dir);
        expect(envelope.startsWith("encrypted:v1:")).toBe(true);
        expect(decryptValue(envelope, privateKey)).toBe("api-secret");
    });

    it("encrypt produces a value decryptable by core decrypt", () => {
        const { privateKey } = keygen(dir);
        const stored = readFileSync(join(dir, PUBLIC_KEY_PATH), "utf8").trim();
        const directEnvelope = encryptValue("api-secret", stored);
        expect(decryptValue(directEnvelope, privateKey)).toBe("api-secret");
    });
});
