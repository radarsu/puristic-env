import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { constants } from "node:os";
import { resolve } from "node:path";
import { decrypt, expandEnv, inspectSchema, isEnvelope, listEntries, loadDefinition, parseEnv, resolvePrivateKey } from "@confederation/core/index.js";
import { findNearestConfig } from "./discoverConfig.js";

const DEFAULT_ENV_FILES = [".env", ".env.local"];

export interface ResolveRunEnvOptions {
    envFiles?: string[];
    configPath?: string;
    defaults?: boolean;
    cwd?: string;
    ambient?: Record<string, string | undefined>;
    onWarn?: (message: string) => void;
}

// Build the env map to inject: merge the .env files, decrypt secret envelopes, optionally fill in
// schema defaults, then expand ${VAR}/$VAR references against siblings and the ambient environment.
export async function resolveRunEnv(options: ResolveRunEnvOptions = {}): Promise<Record<string, string>> {
    const cwd = options.cwd ?? process.cwd();
    const ambient = options.ambient ?? process.env;
    const requested = options.envFiles !== undefined && options.envFiles.length > 0 ? options.envFiles : DEFAULT_ENV_FILES;
    const files = requested.map((file) => resolve(cwd, file)).filter((file) => existsSync(file));

    const record: Record<string, string> = {};
    for (const file of files) {
        for (const entry of listEntries(parseEnv(readFileSync(file, "utf8")))) {
            record[entry.key] = entry.value;
        }
    }

    decryptInto(record);

    if (options.defaults === true) {
        await applyDefaults(record, ambient, cwd, options.configPath, options.onWarn);
    }

    return expandEnv(record, (name) => ambient[name]);
}

// Spawn a command with the resolved variables overlaid on the current environment, inheriting the
// terminal. Resolves to the exit code (128 + signal number when the child is killed by a signal).
export function spawnEnv(command: string, args: string[], env: Record<string, string>, cwd: string): Promise<number> {
    return new Promise((resolveExit, rejectExit) => {
        const child = spawn(command, args, { stdio: "inherit", cwd, env: { ...process.env, ...env } });
        child.on("error", rejectExit);
        child.on("close", (code, signal) => {
            resolveExit(signal === null ? (code ?? 0) : 128 + (constants.signals[signal] ?? 0));
        });
    });
}

// Single-quote a value for `export KEY=…` shell output: wrap in '…' and escape embedded quotes.
export function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

function decryptInto(record: Record<string, string>): void {
    let key: Uint8Array | undefined;
    for (const name of Object.keys(record)) {
        const value = record[name] as string;
        if (!isEnvelope(value)) {
            continue;
        }
        if (key === undefined) {
            key = resolvePrivateKey();
        }
        record[name] = decrypt(value, key);
    }
}

async function applyDefaults(
    record: Record<string, string>,
    ambient: Record<string, string | undefined>,
    cwd: string,
    configPath: string | undefined,
    onWarn?: (message: string) => void,
): Promise<void> {
    const config = configPath !== undefined ? resolve(cwd, configPath) : findNearestConfig(cwd);
    if (config === undefined) {
        onWarn?.("--defaults: no confederation.config.* found above the current directory; skipping schema defaults.");
        return;
    }
    const definition = await loadDefinition(config);
    for (const descriptor of inspectSchema(definition.schema)) {
        if (!descriptor.hasDefault || descriptor.default === undefined) {
            continue;
        }
        if (record[descriptor.envName] !== undefined || ambient[descriptor.envName] !== undefined) {
            continue;
        }
        record[descriptor.envName] = String(descriptor.default);
    }
}
