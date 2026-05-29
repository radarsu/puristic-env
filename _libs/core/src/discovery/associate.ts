import { dirOf, isAncestorOrSame } from "./paths.js";

// Associate each .env file with the nearest ancestor env.config.* (the owning schema).
// Returns fileId -> configId, or undefined when no config governs that directory.
export function associateConfigs(envFileIds: string[], configIds: string[]): Map<string, string | undefined> {
    const configDirs = configIds.map((configId) => ({ configId, dir: dirOf(configId) }));
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
            }
        }
        result.set(fileId, best?.configId);
    }
    return result;
}
