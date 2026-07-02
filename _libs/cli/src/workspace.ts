import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
    associateConfigs,
    baseName,
    dirOf,
    inspectSchema,
    type LeafDescriptorPublic,
    loadDefinition,
    NotAnEnvConfigError,
    packageRootOf,
} from "@puristic/env/index.js";
import type { z } from "zod";

const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".cache", ".turbo", ".git"]);
const TEMPLATE_NAMES = new Set([".env.example", ".env.sample", ".env.template"]);
// Any file ending in `config.<ext>` — covers config.ts, env.config.ts, deploy.config.ts, vite.config.ts…
const CONFIG_RE = /config\.(c|m)?[jt]s$/;

export interface AppConfig {
    configId: string;
    path: string;
    app: string;
    schema: z.ZodType;
    descriptors: LeafDescriptorPublic[];
}

export interface ConfigError {
    path: string;
    error: string;
}

export interface Workspace {
    root: string;
    envPaths: string[];
    // Config files that matched the scan but failed to load (a syntax error or throwing import).
    // Configs that simply aren't env schemas are skipped silently, not listed here.
    configErrors: ConfigError[];
    // The env config(s) whose values the given .env supplies (need not exist on disk — a synthetic
    // path lets gen/run resolve the schemas that would govern a .env at that location).
    configsFor(envPathAbsolute: string): AppConfig[];
}

// Scan a workspace, load every config candidate, and expose the env config(s) governing each .env.
// With an explicit override the whole scan is bypassed: that one config governs every .env (its load
// errors propagate — the user pointed at it directly).
export async function loadWorkspace(root: string, override?: string): Promise<Workspace> {
    const rootDir = resolve(root);
    const { envPaths, configPaths, packageRootIds } = scanTree(rootDir);

    if (override !== undefined) {
        const overridePath = resolve(rootDir, override);
        const definition = await loadDefinition(overridePath);
        const config: AppConfig = {
            configId: relId(rootDir, overridePath),
            path: overridePath,
            app: appLabel(rootDir, relId(rootDir, overridePath), packageRootIds),
            schema: definition.schema,
            descriptors: inspectSchema(definition.schema),
        };
        return { root: rootDir, envPaths, configErrors: [], configsFor: () => [config] };
    }

    const configs = new Map<string, AppConfig>();
    const configErrors: ConfigError[] = [];
    for (const path of configPaths) {
        const configId = relId(rootDir, path);
        try {
            const definition = await loadDefinition(path);
            configs.set(configId, {
                configId,
                path,
                app: appLabel(rootDir, configId, packageRootIds),
                schema: definition.schema,
                descriptors: inspectSchema(definition.schema),
            });
        } catch (cause) {
            if (cause instanceof NotAnEnvConfigError) {
                continue;
            }
            configErrors.push({ path: relative(rootDir, path), error: (cause as Error).message });
        }
    }

    const validIds = [...configs.keys()];
    const envIds = envPaths.map((path) => relId(rootDir, path));

    return {
        root: rootDir,
        envPaths,
        configErrors,
        configsFor(envPathAbsolute: string): AppConfig[] {
            const id = relId(rootDir, resolve(rootDir, envPathAbsolute));
            const association = associateConfigs([...new Set([...envIds, id])], validIds, packageRootIds);
            return (association.get(id) ?? []).map((configId) => configs.get(configId)).filter((config): config is AppConfig => config !== undefined);
        },
    };
}

function scanTree(root: string): { envPaths: string[]; configPaths: string[]; packageRootIds: string[] } {
    const envPaths: string[] = [];
    const configPaths: string[] = [];
    const packageRootIds: string[] = [];
    const walk = (dir: string): void => {
        // A directory can vanish between listing and recursion (concurrent builds); skip it rather than fail.
        let entries: Dirent[];
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!EXCLUDED_DIRS.has(entry.name)) {
                    walk(join(dir, entry.name));
                }
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            if (entry.name === "package.json") {
                packageRootIds.push(relId(root, dir));
            } else if (isEnvFileName(entry.name)) {
                envPaths.push(join(dir, entry.name));
            } else if (CONFIG_RE.test(entry.name)) {
                configPaths.push(join(dir, entry.name));
            }
        }
    };
    walk(root);
    return { envPaths: envPaths.sort(), configPaths: configPaths.sort(), packageRootIds: packageRootIds.sort() };
}

function isEnvFileName(name: string): boolean {
    if (TEMPLATE_NAMES.has(name)) {
        return false;
    }
    return name === ".env" || name.startsWith(".env.");
}

// The app a config belongs to: its package's package.json "name", else the package dir basename,
// else the workspace root's basename (a config sitting at the root).
function appLabel(root: string, configId: string, packageRootIds: string[]): string {
    const packageDir = packageRootOf(dirOf(configId), packageRootIds);
    const name = packageDir === undefined ? undefined : readPackageName(join(root, packageDir));
    if (name !== undefined) {
        return name;
    }
    const dir = packageDir ?? dirOf(configId);
    return dir === "" ? baseName(root) : baseName(dir);
}

function readPackageName(packageDir: string): string | undefined {
    try {
        const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { name?: string };
        return manifest.name;
    } catch {
        return undefined;
    }
}

function relId(root: string, path: string): string {
    return relative(root, path).split("\\").join("/");
}
