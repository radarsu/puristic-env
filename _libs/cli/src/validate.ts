import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
    attributeConfigs,
    classify,
    isEnvelope,
    type LeafDescriptorPublic,
    listEntries,
    mergeValidationReports,
    parseEnv,
    type ValidationReport,
    type VarStatus,
    validateValues,
} from "@puristic/env/index.js";
import { type ConfigError, loadWorkspace, type Workspace } from "./workspace.js";

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
    // Apps whose schema declares this variable; shared is true when more than one does.
    apps?: string[];
    shared?: boolean;
}

export interface ValidateFileResult {
    path: string;
    configPaths: string[];
    rows: ValidateRow[];
    formError?: string;
    errorCount: number;
    warningCount: number;
}

export interface ValidateResult {
    ok: boolean;
    files: ValidateFileResult[];
    configErrors: ConfigError[];
    errorCount: number;
    warningCount: number;
}

export async function validate(options: ValidateOptions): Promise<ValidateResult> {
    const cwd = options.cwd ?? process.cwd();
    const workspace = await loadWorkspace(cwd, options.configPath);
    const envPaths = options.envFiles.length > 0 ? unique(options.envFiles.map((file) => resolve(cwd, file))) : workspace.envPaths;

    const files = envPaths.map((envPath) => validateEnv(cwd, envPath, workspace, options.strict));

    const errorCount = files.reduce((sum, file) => sum + file.errorCount, 0);
    const warningCount = files.reduce((sum, file) => sum + file.warningCount, 0) + workspace.configErrors.length;
    return { ok: errorCount === 0, files, configErrors: workspace.configErrors, errorCount, warningCount };
}

function validateEnv(cwd: string, envPath: string, workspace: Workspace, strict: boolean): ValidateFileResult {
    const configs = workspace.configsFor(envPath);
    const configPaths = configs.map((config) => relative(cwd, config.path));
    if (configs.length === 0) {
        return { path: relative(cwd, envPath), configPaths, rows: [], errorCount: 0, warningCount: 0 };
    }

    const raw = readRawEnv(envPath);
    const attribution = attributeConfigs(configs.map((config) => ({ configId: config.configId, app: config.app, descriptors: config.descriptors })));
    const report = mergeValidationReports(configs.map((config) => validateValues(config.schema, raw)));
    const { rows, errorCount, warningCount } = classifyEnv(attribution.descriptors, raw, report, strict, attribution.appsByEnv);
    const result: ValidateFileResult = { path: relative(cwd, envPath), configPaths, rows, errorCount, warningCount };
    if (report.formError !== undefined) {
        result.formError = report.formError;
        result.errorCount++;
    }
    return result;
}

// Classify every variable in a file against the union of its schemas — the same taxonomy the VSCode
// editor uses (secret leaves skip value validation; unknown keys are warnings unless --strict). Each
// known row is tagged with the app(s) that declare it, so shared variables surface their owners.
export function classifyEnv(
    descriptors: LeafDescriptorPublic[],
    raw: Record<string, string>,
    report: ValidationReport,
    strict: boolean,
    appsByEnv: Map<string, string[]>,
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
        const row: ValidateRow = { envName: descriptor.envName, status: result.status };
        if (result.message !== undefined) {
            row.message = result.message;
        }
        const apps = appsByEnv.get(descriptor.envName);
        if (apps !== undefined) {
            row.apps = apps;
            if (apps.length > 1) {
                row.shared = true;
            }
        }
        rows.push(row);
        if (ERROR_STATUSES.has(result.status)) {
            errorCount++;
        }
    }

    for (const key of Object.keys(raw)) {
        if (knownEnvNames.has(key)) {
            continue;
        }
        rows.push({ envName: key, status: "unknown", message: "Not defined in any schema" });
        if (strict) {
            errorCount++;
        } else {
            warningCount++;
        }
    }

    return { rows, errorCount, warningCount };
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

function unique(values: string[]): string[] {
    return [...new Set(values)];
}
