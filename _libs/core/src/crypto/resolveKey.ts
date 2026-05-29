import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { base64urlDecode } from "./format.js";

export const PUBLIC_KEY_PATH = ".config/puristic-pub.key";

export interface DecryptOptions {
    privateKey?: string | Uint8Array;
    privateKeyPath?: string;
    disabled?: boolean;
}

export function resolvePublicKey(cwd: string = process.cwd()): Uint8Array {
    const projectRoot = findProjectRoot(cwd);
    const path = join(projectRoot, PUBLIC_KEY_PATH);
    if (!existsSync(path)) {
        throw new Error(`Public key not found at ${path}. Run \`puristic keygen\` to create one.`);
    }
    return base64urlDecode(readFileSync(path, "utf8").trim());
}

export function resolvePrivateKey(options?: DecryptOptions): Uint8Array {
    if (options?.privateKey !== undefined) {
        return typeof options.privateKey === "string" ? base64urlDecode(options.privateKey) : options.privateKey;
    }
    if (options?.privateKeyPath !== undefined) {
        return readPrivateKeyFile(options.privateKeyPath);
    }
    const envInline = process.env["PURISTIC_PRIVATE_KEY"];
    if (envInline !== undefined && envInline !== "") {
        return base64urlDecode(envInline);
    }
    const envPath = process.env["PURISTIC_PRIVATE_KEY_FILE"];
    if (envPath !== undefined && envPath !== "") {
        return readPrivateKeyFile(envPath);
    }
    const defaultPath = defaultPrivateKeyPath(process.cwd());
    if (existsSync(defaultPath)) {
        return readPrivateKeyFile(defaultPath);
    }
    throw new Error(`No private key found. Set PURISTIC_PRIVATE_KEY env var, PURISTIC_PRIVATE_KEY_FILE, or place key at ${defaultPath}.`);
}

export function defaultPrivateKeyPath(cwd: string): string {
    const projectRoot = findProjectRoot(cwd);
    const name = readProjectName(projectRoot);
    return join(homedir(), ".config", "puristic", name, "private.key");
}

export function resolveProjectName(cwd: string = process.cwd()): string {
    return readProjectName(findProjectRoot(cwd));
}

function readPrivateKeyFile(path: string): Uint8Array {
    if (!existsSync(path)) {
        throw new Error(`Private key file not found: ${path}`);
    }
    return base64urlDecode(readFileSync(path, "utf8").trim());
}

function findProjectRoot(start: string): string {
    let current = resolve(start);
    while (true) {
        if (existsSync(join(current, "package.json"))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current || parent === sep) {
            throw new Error(`No package.json found above ${start}`);
        }
        current = parent;
    }
}

function readProjectName(projectRoot: string): string {
    const pkgPath = join(projectRoot, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: unknown };
    if (typeof pkg.name !== "string" || pkg.name === "") {
        throw new Error(`package.json at ${pkgPath} has no "name" field`);
    }
    return slugifyProjectName(pkg.name);
}

function slugifyProjectName(name: string): string {
    return name.replace(/^@/, "").replace(/\//g, "__");
}
