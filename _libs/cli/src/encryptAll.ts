import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { encrypt, isEnvelope, listEntries, parseEnv, resolvePublicKey, serializeEnv, setValue } from "@puristic/env/index.js";
import { loadWorkspace } from "./workspace.js";

export interface EncryptAllOptions {
    envFiles: string[];
    config?: string;
    cwd?: string;
}

export interface EncryptAllResult {
    files: { path: string; encrypted: number }[];
}

// Encrypt every plaintext value at a secret-marked key, in place, preserving file formatting. A key is
// secret if any of the schemas governing the file marks it secret (union across the file's apps).
export async function encryptAll(options: EncryptAllOptions): Promise<EncryptAllResult> {
    const cwd = options.cwd ?? process.cwd();
    const workspace = await loadWorkspace(cwd, options.config);

    const files: { path: string; encrypted: number }[] = [];
    for (const file of options.envFiles) {
        const envPath = resolve(cwd, file);
        const configs = workspace.configsFor(envPath);
        if (configs.length === 0) {
            throw new Error(`No env config governs ${envPath}. Pass --config <path>.`);
        }
        const secrets = new Set(
            configs.flatMap((config) => config.descriptors.filter((descriptor) => descriptor.secret).map((descriptor) => descriptor.envName)),
        );
        files.push(encryptFile(cwd, envPath, secrets));
    }
    return { files };
}

function encryptFile(cwd: string, envPath: string, secrets: Set<string>): { path: string; encrypted: number } {
    if (!existsSync(envPath)) {
        throw new Error(`File not found: ${envPath}`);
    }
    const publicKey = resolvePublicKey(dirname(envPath));
    let doc = parseEnv(readFileSync(envPath, "utf8"));
    let encrypted = 0;
    for (const entry of listEntries(doc)) {
        if (!secrets.has(entry.key) || entry.value === "" || isEnvelope(entry.value)) {
            continue;
        }
        doc = setValue(doc, entry.key, encrypt(entry.value, publicKey));
        encrypted++;
    }
    if (encrypted > 0) {
        writeFileSync(envPath, serializeEnv(doc));
    }
    return { path: relative(cwd, envPath), encrypted };
}
