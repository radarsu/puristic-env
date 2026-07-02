import { dirOf, isAncestorOrSame, packageRootOf, preferConfig } from "./paths.js";

// Associate each .env with the env config(s) whose values it supplies. One rule covers two topologies:
//  - classic: a .env sits in (or under) a package whose config governs it -> that nearest config.
//  - shared root: a single .env feeds every descendant app config that has no closer .env of its own,
//    so a repo-root .env validates against all app schemas below it.
// A config governs the package it lives in (its package.json dir), so a config nested in src/ still
// binds to the package-root .env. Returns fileId -> configId[] (empty when nothing governs it).
export function associateConfigs(envFileIds: string[], configIds: string[], packageRootDirs: string[]): Map<string, string[]> {
    const configDirs = configIds.map((configId) => ({ configId, dir: packageRootOf(dirOf(configId), packageRootDirs) ?? dirOf(configId) }));
    const envDirs = new Set(envFileIds.map(dirOf));
    const result = new Map<string, string[]>();
    for (const fileId of envFileIds) {
        const envDir = dirOf(fileId);
        const primary = collapse(configDirs.filter((candidate) => anchorDir(candidate.dir, envDirs) === envDir));
        result.set(fileId, primary.length > 0 ? primary : fallback(configDirs, envDir));
    }
    return result;
}

// Walk dir upward (to "" inclusive); the first directory that itself holds a .env is the .env that
// supplies configs living under dir. undefined when no ancestor-or-self dir has a .env.
function anchorDir(dir: string, envDirs: Set<string>): string | undefined {
    let current = dir;
    while (true) {
        if (envDirs.has(current)) {
            return current;
        }
        if (current === "") {
            return undefined;
        }
        current = dirOf(current);
    }
}

// Multiple configs can share one package dir (e.g. src/env.config.ts + dist/env.config.js). Keep the
// preferConfig winner per package dir so the .ts source wins over compiled output.
function collapse(candidates: { configId: string; dir: string }[]): string[] {
    const byDir = new Map<string, string>();
    for (const candidate of candidates) {
        const existing = byDir.get(candidate.dir);
        byDir.set(candidate.dir, existing === undefined ? candidate.configId : preferConfig(existing, candidate.configId));
    }
    return [...byDir.values()];
}

// Nearest ancestor-or-same config of envDir (longest matching package dir; preferConfig on ties). Used
// only when no descendant config anchors to this .env, preserving plain nearest-ancestor matching.
function fallback(configDirs: { configId: string; dir: string }[], envDir: string): string[] {
    let best: { configId: string; dir: string } | undefined;
    for (const candidate of configDirs) {
        if (!isAncestorOrSame(candidate.dir, envDir)) {
            continue;
        }
        if (best === undefined || candidate.dir.length > best.dir.length) {
            best = candidate;
        } else if (candidate.dir.length === best.dir.length) {
            best = { configId: preferConfig(best.configId, candidate.configId), dir: best.dir };
        }
    }
    return best === undefined ? [] : [best.configId];
}
