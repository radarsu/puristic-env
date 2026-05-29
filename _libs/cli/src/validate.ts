import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
    classify,
    inspectSchema,
    isEnvelope,
    type LeafDescriptorPublic,
    listEntries,
    loadDefinition,
    parseEnv,
    type ValidationReport,
    type VarStatus,
    validateValues,
} from "@puristic/env/index.js";
import { findNearestConfig } from "./discoverConfig.js";

const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".cache", ".turbo", ".git"]);
const TEMPLATE_NAMES = new Set([".env.example", ".env.sample", ".env.template"]);
const ERROR_STATUSES = new Set<VarStatus>(["missing-required", "invalid", "secret-plaintext"]);

export interface ValidateOptions {
    envFiles: string[];
    configPath?: string;
    strict: boolean;
    cwd?: string;
}

export interface ValidateRow {
    envName: string;
    status: VarStatus;
    message?: string;
}

export interface ValidateFileResult {
    path: string;
    configPath?: string;
    rows: ValidateRow[];
    formError?: string;
    configError?: string;
    errorCount: number;
    warningCount: number;
}

export interface ValidateResult {
    ok: boolean;
    files: ValidateFileResult[];
    errorCount: number;
    warningCount: number;
}

type ConfigSchema = Awaited<ReturnType<typeof loadDefinition>>["schema"];
type LoadedConfig = { schema: ConfigSchema; descriptors: LeafDescriptorPublic[] } | { error: string };

export async function validate(options: ValidateOptions): Promise<ValidateResult> {
    const cwd = options.cwd ?? process.cwd();
    const envPaths = options.envFiles.length > 0 ? unique(options.envFiles.map((file) => resolve(cwd, file))) : findEnvFiles(cwd);
    const override = options.configPath !== undefined ? resolve(cwd, options.configPath) : undefined;

    const cache = new Map<string, LoadedConfig>();
    const files: ValidateFileResult[] = [];
    for (const envPath of envPaths) {
        const configPath = override ?? findNearestConfig(dirname(envPath));
        if (configPath === undefined) {
            files.push({ path: relative(cwd, envPath), rows: [], errorCount: 0, warningCount: 0 });
            continue;
        }
        const loaded = await loadConfig(configPath, cache);
        if ("error" in loaded) {
            files.push({
                path: relative(cwd, envPath),
                configPath: relative(cwd, configPath),
                rows: [],
                configError: loaded.error,
                errorCount: 1,
                warningCount: 0,
            });
            continue;
        }
        files.push(validateFile(cwd, envPath, configPath, loaded, options.strict));
    }

    const errorCount = files.reduce((sum, file) => sum + file.errorCount, 0);
    const warningCount = files.reduce((sum, file) => sum + file.warningCount, 0);
    return { ok: errorCount === 0, files, errorCount, warningCount };
}

// Classify every variable in a file against its schema — the same taxonomy the VSCode editor uses
// (secret leaves skip value validation; unknown keys are warnings unless --strict).
export function classifyEnv(
    descriptors: LeafDescriptorPublic[],
    raw: Record<string, string>,
    report: ValidationReport,
    strict: boolean,
): { rows: ValidateRow[]; errorCount: number; warningCount: number } {
    const validationByEnv = new Map(report.leaves.map((leaf) => [leaf.envName, leaf]));
    const knownEnvNames = new Set(descriptors.map((descriptor) => descriptor.envName));
    const rows: ValidateRow[] = [];
    let errorCount = 0;
    let warningCount = 0;

    for (const descriptor of descriptors) {
        const value = raw[descriptor.envName];
        const present = value !== undefined && value !== "";
        const validation = descriptor.secret ? undefined : validationByEnv.get(descriptor.envName);
        const result = classify({
            descriptor,
            present,
            isEncrypted: present && isEnvelope(value),
            validationOk: validation?.ok,
            validationMessage: validation?.message,
        });
        rows.push(
            result.message === undefined
                ? { envName: descriptor.envName, status: result.status }
                : { envName: descriptor.envName, status: result.status, message: result.message },
        );
        if (ERROR_STATUSES.has(result.status)) {
            errorCount++;
        }
    }

    for (const key of Object.keys(raw)) {
        if (knownEnvNames.has(key)) {
            continue;
        }
        rows.push({ envName: key, status: "unknown", message: "Not defined in the schema" });
        if (strict) {
            errorCount++;
        } else {
            warningCount++;
        }
    }

    return { rows, errorCount, warningCount };
}

function validateFile(
    cwd: string,
    envPath: string,
    configPath: string,
    loaded: { schema: ConfigSchema; descriptors: LeafDescriptorPublic[] },
    strict: boolean,
): ValidateFileResult {
    const raw = readRawEnv(envPath);
    const report = validateValues(loaded.schema, raw);
    const { rows, errorCount, warningCount } = classifyEnv(loaded.descriptors, raw, report, strict);
    const result: ValidateFileResult = { path: relative(cwd, envPath), configPath: relative(cwd, configPath), rows, errorCount, warningCount };
    if (report.formError !== undefined) {
        result.formError = report.formError;
        result.errorCount++;
    }
    return result;
}

async function loadConfig(configPath: string, cache: Map<string, LoadedConfig>): Promise<LoadedConfig> {
    const cached = cache.get(configPath);
    if (cached !== undefined) {
        return cached;
    }
    let result: LoadedConfig;
    try {
        const definition = await loadDefinition(configPath);
        result = { schema: definition.schema, descriptors: inspectSchema(definition.schema) };
    } catch (cause) {
        result = { error: (cause as Error).message };
    }
    cache.set(configPath, result);
    return result;
}

function readRawEnv(envPath: string): Record<string, string> {
    if (!existsSync(envPath)) {
        return {};
    }
    const raw: Record<string, string> = {};
    for (const entry of listEntries(parseEnv(readFileSync(envPath, "utf8")))) {
        raw[entry.key] = entry.value;
    }
    return raw;
}

function findEnvFiles(dir: string): string[] {
    const result: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!EXCLUDED_DIRS.has(entry.name)) {
                result.push(...findEnvFiles(join(dir, entry.name)));
            }
            continue;
        }
        if (entry.isFile() && isEnvFileName(entry.name)) {
            result.push(join(dir, entry.name));
        }
    }
    return result.sort();
}

function isEnvFileName(name: string): boolean {
    if (TEMPLATE_NAMES.has(name)) {
        return false;
    }
    return name === ".env" || name.startsWith(".env.");
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}
