import { dirOf, isAncestorOrSame, packageRootOf, preferConfig } from "./paths.js";

// Associate each .env file with the env.config.* that governs it (the owning schema).
// A config governs the package it lives in (its nearest package.json directory), so a config nested
// in src/ still owns the package-root .env files. Configs outside any package fall back to their own
// directory, preserving plain nearest-ancestor matching. Returns fileId -> configId, or undefined
// when no config governs that directory.
export function associateConfigs(envFileIds: string[], configIds: string[], packageRootDirs: string[]): Map<string, string | undefined> {
    const configDirs = configIds.map((configId) => ({ configId, dir: packageRootOf(dirOf(configId), packageRootDirs) ?? dirOf(configId) }));
    const result = new Map<string, string | undefined>();
    for (const fileId of envFileIds) {
        const envDir = dirOf(fileId);
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
        result.set(fileId, best?.configId);
    }
    return result;
}
