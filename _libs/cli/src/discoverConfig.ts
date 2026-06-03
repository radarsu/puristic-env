import { type Dirent, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { preferConfig } from "@puristic/env/index.js";

const CONFIG_NAMES = ["env.config.ts", "env.config.mts", "env.config.cts", "env.config.js", "env.config.mjs", "env.config.cjs"];
const CONFIG_BASENAMES = new Set(CONFIG_NAMES);
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".turbo", ".cache"]);

// Find the env.config.* that governs startDir. A config governs the package it lives in, so a config
// nested in src/ still owns the package-root .env files. Walking up, the first directory that yields a
// config wins (the nearest package); ties prefer the .ts source over compiled output.
export function findGoverningConfig(startDir: string): string | undefined {
    let current = resolve(startDir);
    while (true) {
        const candidates = collectConfigs(current);
        if (candidates.length > 0) {
            return candidates.reduce((best, candidate) => preferConfig(best, candidate));
        }
        const parent = dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}

// When dir is a package root, any config in its subtree (excluding nested packages, which own their
// own configs); otherwise only configs sitting directly in dir.
function collectConfigs(dir: string): string[] {
    if (existsSync(join(dir, "package.json"))) {
        return searchPackageSubtree(dir);
    }
    return CONFIG_NAMES.map((name) => join(dir, name)).filter((candidate) => existsSync(candidate));
}

function searchPackageSubtree(packageRoot: string): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
        // A directory can vanish between listing and recursion (concurrent builds); skip it rather than fail.
        let entries: Dirent[];
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isFile() && CONFIG_BASENAMES.has(entry.name)) {
                found.push(join(dir, entry.name));
                continue;
            }
            if (!entry.isDirectory() || EXCLUDED_DIRS.has(entry.name)) {
                continue;
            }
            const child = join(dir, entry.name);
            if (existsSync(join(child, "package.json"))) {
                continue;
            }
            walk(child);
        }
    };
    walk(packageRoot);
    return found;
}
