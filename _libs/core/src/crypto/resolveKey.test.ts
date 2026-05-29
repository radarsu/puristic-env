import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { base64urlDecode } from "./format.js";
import { generateKeypair } from "./keygen.js";
import { defaultPrivateKeyPath, PUBLIC_KEY_PATH, resolvePrivateKey, resolveProjectName, resolvePublicKey } from "./resolveKey.js";

let dir: string;
const savedEnv = { ...process.env };

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "puristic-resolve-"));
    delete process.env["PURISTIC_PRIVATE_KEY"];
    delete process.env["PURISTIC_PRIVATE_KEY_FILE"];
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const k of ["PURISTIC_PRIVATE_KEY", "PURISTIC_PRIVATE_KEY_FILE"]) {
        if (savedEnv[k] !== undefined) {
            process.env[k] = savedEnv[k];
        } else {
            delete process.env[k];
        }
    }
});

function writeProject(name: string): string {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
    return dir;
}

describe("resolvePublicKey", () => {
    it("reads the public key from .config/puristic-pub.key relative to the project root", () => {
        const projectRoot = writeProject("test-project");
        mkdirSync(join(projectRoot, ".config"));
        const { publicKey } = generateKeypair();
        writeFileSync(join(projectRoot, PUBLIC_KEY_PATH), publicKey);
        const resolved = resolvePublicKey(projectRoot);
        expect(resolved).toEqual(base64urlDecode(publicKey));
    });

    it("throws a helpful error if the public key file is missing", () => {
        const projectRoot = writeProject("test-project");
        expect(() => resolvePublicKey(projectRoot)).toThrow(/puristic keygen/);
    });
});

describe("resolvePrivateKey", () => {
    it("uses an inline privateKey option when provided", () => {
        const { privateKey } = generateKeypair();
        expect(resolvePrivateKey({ privateKey })).toEqual(base64urlDecode(privateKey));
    });

    it("uses an explicit privateKeyPath option when provided", () => {
        const { privateKey } = generateKeypair();
        const path = join(dir, "explicit.key");
        writeFileSync(path, privateKey);
        expect(resolvePrivateKey({ privateKeyPath: path })).toEqual(base64urlDecode(privateKey));
    });

    it("reads PURISTIC_PRIVATE_KEY env var", () => {
        const { privateKey } = generateKeypair();
        process.env["PURISTIC_PRIVATE_KEY"] = privateKey;
        expect(resolvePrivateKey()).toEqual(base64urlDecode(privateKey));
    });

    it("reads PURISTIC_PRIVATE_KEY_FILE env var", () => {
        const { privateKey } = generateKeypair();
        const path = join(dir, "from-env.key");
        writeFileSync(path, privateKey);
        process.env["PURISTIC_PRIVATE_KEY_FILE"] = path;
        expect(resolvePrivateKey()).toEqual(base64urlDecode(privateKey));
    });

    it("inline privateKey wins over env vars", () => {
        const inline = generateKeypair();
        const env = generateKeypair();
        process.env["PURISTIC_PRIVATE_KEY"] = env.privateKey;
        expect(resolvePrivateKey({ privateKey: inline.privateKey })).toEqual(base64urlDecode(inline.privateKey));
    });

    it("throws with a message naming the default path when nothing is configured", () => {
        const cwd = process.cwd();
        process.chdir(writeProject("missing-key-test"));
        try {
            expect(() => resolvePrivateKey()).toThrow(/No private key found/);
        } finally {
            process.chdir(cwd);
        }
    });
});

describe("resolveProjectName / defaultPrivateKeyPath", () => {
    it("returns the package.json name for a plain project", () => {
        writeProject("my-app");
        expect(resolveProjectName(dir)).toBe("my-app");
    });

    it("slugifies scoped names: @scope/foo -> scope__foo", () => {
        writeProject("@scope/foo");
        expect(resolveProjectName(dir)).toBe("scope__foo");
        expect(defaultPrivateKeyPath(dir).endsWith("scope__foo/private.key")).toBe(true);
    });
});
