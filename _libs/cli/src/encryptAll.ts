import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
    encrypt,
    inspectSchema,
    isEnvelope,
    listEntries,
    loadDefinition,
    parseEnv,
    resolvePublicKey,
    serializeEnv,
    setValue,
} from "@puristic/env/index.js";
import { findNearestConfig } from "./discoverConfig.js";

export interface EncryptAllOptions {
    envFiles: string[];
    config?: string;
    cwd?: string;
}

export interface EncryptAllResult {
    files: { path: string; encrypted: number }[];
}

// Encrypt every plaintext value at a secret-marked key, in place, preserving file formatting.
export async function encryptAll(options: EncryptAllOptions): Promise<EncryptAllResult> {
    const cwd = options.cwd ?? process.cwd();
    const override = options.config !== undefined ? resolve(cwd, options.config) : undefined;
    const secretsByConfig = new Map<string, Set<string>>();

    const files: { path: string; encrypted: number }[] = [];
    for (const file of options.envFiles) {
        const envPath = resolve(cwd, file);
        const configPath = override ?? findNearestConfig(dirname(envPath));
        if (configPath === undefined) {
            throw new Error(`No env.config.* governs ${envPath}. Pass --config <path>.`);
        }
        files.push(encryptFile(cwd, envPath, await secretEnvNames(configPath, secretsByConfig)));
    }
    return { files };
}

async function secretEnvNames(configPath: string, cache: Map<string, Set<string>>): Promise<Set<string>> {
    const cached = cache.get(configPath);
    if (cached !== undefined) {
        return cached;
    }
    const definition = await loadDefinition(configPath);
    const secrets = new Set(
        inspectSchema(definition.schema)
            .filter((descriptor) => descriptor.secret)
            .map((descriptor) => descriptor.envName),
    );
    cache.set(configPath, secrets);
    return secrets;
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
