import {
    attributeConfigs,
    baseName,
    classify,
    isEnvelope,
    type LeafDescriptorPublic,
    mergeValidationReports,
    type ValidationReport,
    type VarStatus,
} from "@puristic/env/index.js";
import { FORMAT_META } from "../../shared/formats.js";
import type {
    BadgeStatus,
    ControlType,
    DirView,
    FileView,
    Landscape,
    MatrixColumn,
    MatrixRow,
    MatrixSection,
    VarRow,
} from "../../shared/protocol.js";

// One env config governing a file: its own introspected leaves and their validation against the file.
// A file with more than one (a shared root .env) is validated against the union of them.
export interface ConfigInput {
    configId: string;
    app: string;
    descriptors: LeafDescriptorPublic[];
    validation: ValidationReport;
}

export interface FileInput {
    fileId: string;
    fileName: string;
    dirId: string;
    dirty: boolean;
    text: string;
    entries: { key: string; value: string }[];
    configs?: ConfigInput[];
    configError?: string;
}

export interface LandscapeInput {
    files: FileInput[];
    activeFileId: string;
}

export function buildLandscape(input: LandscapeInput): Landscape {
    const files: Record<string, FileView> = {};
    const columns: MatrixColumn[] = [];
    const statusByFile = new Map<string, Map<string, VarStatus>>();

    for (const file of input.files) {
        const view = buildFileView(file);
        files[file.fileId] = view;
        if (view.hasSchema) {
            columns.push({ fileId: file.fileId, dirId: file.dirId, fileName: file.fileName });
            statusByFile.set(file.fileId, new Map(view.rows.filter((row) => row.path.length > 0).map((row) => [row.envName, row.status])));
        }
    }

    return {
        files,
        columns,
        dirs: buildDirs(input.files, files),
        matrix: buildMatrix(input.files, columns, statusByFile),
        activeFileId: input.activeFileId,
        // The host fills this in (attachDecryptedSecrets); the pure model assumes no key.
        privateKeyAvailable: false,
    };
}

function buildFileView(file: FileInput): FileView {
    const entryMap = new Map<string, string>();
    for (const entry of file.entries) {
        entryMap.set(entry.key, entry.value);
    }

    if (file.configs === undefined || file.configs.length === 0) {
        const rows = file.entries.map((entry) => plainRow(entry.key, entry.value));
        const badge: BadgeStatus = file.configError !== undefined ? "error" : "none";
        const base: FileView = {
            fileId: file.fileId,
            fileName: file.fileName,
            dirId: file.dirId,
            dirty: file.dirty,
            text: file.text,
            hasSchema: false,
            rows,
            missingRequired: 0,
            invalid: 0,
            unknown: 0,
            badge,
        };
        return file.configError !== undefined ? { ...base, configError: file.configError } : base;
    }

    const attribution = attributeConfigs(
        file.configs.map((config) => ({ configId: config.configId, app: config.app, descriptors: config.descriptors })),
    );
    const validation = mergeValidationReports(file.configs.map((config) => config.validation));
    const validationByEnv = new Map(validation.leaves.map((leaf) => [leaf.envName, leaf]));
    const knownEnvNames = new Set(attribution.descriptors.map((descriptor) => descriptor.envName));
    const rows: VarRow[] = [];
    let missingRequired = 0;
    let invalid = 0;

    for (const descriptor of attribution.descriptors) {
        const rawValue = entryMap.get(descriptor.envName);
        const present = rawValue !== undefined && rawValue !== "";
        const encrypted = rawValue !== undefined && isEnvelope(rawValue);
        const leaf = descriptor.secret ? undefined : validationByEnv.get(descriptor.envName);
        const result = classify({
            descriptor,
            present,
            isEncrypted: encrypted,
            validationOk: leaf?.ok,
            validationMessage: leaf?.message,
        });
        if (result.status === "missing-required") {
            missingRequired++;
        }
        if (result.status === "invalid") {
            invalid++;
        }
        rows.push(
            buildVarRow(descriptor, rawValue, present, encrypted, result.status, result.message, attribution.appsByEnv.get(descriptor.envName)),
        );
    }

    let unknown = 0;
    for (const entry of file.entries) {
        if (knownEnvNames.has(entry.key)) {
            continue;
        }
        unknown++;
        rows.push(plainRow(entry.key, entry.value, "unknown", "Not defined in any schema"));
    }

    const badge = computeBadge(rows, validation.formError !== undefined);
    const view: FileView = {
        fileId: file.fileId,
        fileName: file.fileName,
        dirId: file.dirId,
        dirty: file.dirty,
        text: file.text,
        hasSchema: true,
        rows,
        missingRequired,
        invalid,
        unknown,
        badge,
        apps: [...new Set(file.configs.map((config) => config.app))],
        perConfig: file.configs.map((config) => ({
            app: config.app,
            configId: config.configId,
            envNames: config.descriptors.map((descriptor) => descriptor.envName),
        })),
    };
    if (attribution.conflicts.length > 0) {
        view.conflicts = attribution.conflicts;
    }
    return view;
}

function buildVarRow(
    descriptor: LeafDescriptorPublic,
    rawValue: string | undefined,
    present: boolean,
    isEncrypted: boolean,
    status: VarStatus,
    message: string | undefined,
    apps: string[] | undefined,
): VarRow {
    const hint = deriveControl(descriptor);
    const row: VarRow = {
        envName: descriptor.envName,
        path: descriptor.path,
        displayName: descriptor.path[descriptor.path.length - 1] ?? descriptor.envName,
        group: descriptor.path.slice(0, -1).join("."),
        typeLabel: typeLabel(descriptor),
        control: hint.control,
        required: descriptor.required,
        hasDefault: descriptor.hasDefault,
        secret: descriptor.secret,
        present,
        isEncrypted,
        status,
    };
    if (hint.format !== undefined) {
        row.format = hint.format;
    }
    if (hint.pattern !== undefined) {
        row.pattern = hint.pattern;
    }
    if (hint.min !== undefined) {
        row.min = hint.min;
    }
    if (hint.max !== undefined) {
        row.max = hint.max;
    }
    if (hint.step !== undefined) {
        row.step = hint.step;
    }
    if (hint.minLength !== undefined) {
        row.minLength = hint.minLength;
    }
    if (hint.maxLength !== undefined) {
        row.maxLength = hint.maxLength;
    }
    if (rawValue !== undefined) {
        row.rawValue = rawValue;
    }
    if (descriptor.hasDefault && descriptor.default !== undefined) {
        row.defaultValue = String(descriptor.default);
    }
    if (descriptor.enumValues !== undefined) {
        row.enumValues = descriptor.enumValues;
    }
    if (message !== undefined) {
        row.message = message;
    }
    if (apps !== undefined) {
        row.apps = apps;
        if (apps.length > 1) {
            row.shared = true;
        }
    }
    return row;
}

function plainRow(key: string, value: string, status: VarStatus = "no-schema", message?: string): VarRow {
    const row: VarRow = {
        envName: key,
        path: [],
        displayName: key,
        group: "",
        typeLabel: "",
        control: "text",
        required: false,
        hasDefault: false,
        secret: false,
        present: value !== "",
        rawValue: value,
        isEncrypted: isEnvelope(value),
        status,
    };
    if (message !== undefined) {
        row.message = message;
    }
    return row;
}

function typeLabel(descriptor: LeafDescriptorPublic): string {
    if (descriptor.constraints.length === 0) {
        return descriptor.type;
    }
    const labels = descriptor.constraints.map((constraint) =>
        constraint.kind === "format" && typeof constraint.value === "string"
            ? (FORMAT_META[constraint.value]?.label ?? constraint.label)
            : constraint.label,
    );
    return `${descriptor.type} (${labels.join(", ")})`;
}

interface ControlHint {
    control: ControlType;
    format?: string;
    pattern?: string;
    min?: number;
    max?: number;
    step?: number;
    minLength?: number;
    maxLength?: number;
}

function deriveControl(descriptor: LeafDescriptorPublic): ControlHint {
    if (descriptor.type === "number") {
        const hint: ControlHint = { control: "number" };
        for (const constraint of descriptor.constraints) {
            if (constraint.kind === "format" && (constraint.label === "int" || constraint.value === "safeint" || constraint.value === "int32")) {
                hint.step = 1;
            } else if (constraint.kind === "min" && typeof constraint.value === "number") {
                hint.min = constraint.value;
            } else if (constraint.kind === "max" && typeof constraint.value === "number") {
                hint.max = constraint.value;
            }
        }
        return hint;
    }
    if (descriptor.type === "boolean") {
        return { control: "boolean" };
    }
    if (descriptor.type === "string") {
        const hint: ControlHint = { control: "text" };
        for (const constraint of descriptor.constraints) {
            if (constraint.kind === "format" && typeof constraint.value === "string") {
                hint.format = constraint.value;
                if (constraint.regex !== undefined) {
                    hint.pattern = constraint.regex.source;
                }
            } else if (constraint.kind === "minLength" && typeof constraint.value === "number") {
                hint.minLength = constraint.value;
            } else if (constraint.kind === "maxLength" && typeof constraint.value === "number") {
                hint.maxLength = constraint.value;
            }
        }
        return hint;
    }
    return { control: "text" };
}

function computeBadge(rows: VarRow[], hasFormError: boolean): BadgeStatus {
    const hasError =
        hasFormError || rows.some((row) => row.status === "missing-required" || row.status === "invalid" || row.status === "secret-plaintext");
    if (hasError) {
        return "error";
    }
    return rows.some((row) => row.status === "unknown") ? "warn" : "ok";
}

function buildDirs(inputs: FileInput[], files: Record<string, FileView>): DirView[] {
    const order: string[] = [];
    const byDir = new Map<string, { fileIds: string[]; configIds: Set<string> }>();
    for (const file of inputs) {
        let group = byDir.get(file.dirId);
        if (group === undefined) {
            group = { fileIds: [], configIds: new Set() };
            byDir.set(file.dirId, group);
            order.push(file.dirId);
        }
        group.fileIds.push(file.fileId);
        for (const config of file.configs ?? []) {
            group.configIds.add(config.configId);
        }
    }
    return order.map((dirId) => {
        const group = byDir.get(dirId) ?? { fileIds: [], configIds: new Set<string>() };
        const dir: DirView = {
            dirId,
            label: dirId === "" ? "(workspace root)" : baseName(dirId),
            fileIds: group.fileIds,
            badge: worstBadge(group.fileIds.map((fileId) => files[fileId]?.badge ?? "none")),
        };
        if (group.configIds.size > 0) {
            dir.configPaths = [...group.configIds];
        }
        return dir;
    });
}

function worstBadge(badges: BadgeStatus[]): BadgeStatus {
    if (badges.includes("error")) {
        return "error";
    }
    if (badges.includes("warn")) {
        return "warn";
    }
    if (badges.includes("ok")) {
        return "ok";
    }
    return "none";
}

// One section per env config (an "app"). A file appears in a section's column only when that config
// governs it, so a shared root .env shows up under every app, each listing only that app's variables.
function buildMatrix(inputs: FileInput[], columns: MatrixColumn[], statusByFile: Map<string, Map<string, VarStatus>>): MatrixSection[] {
    const order: string[] = [];
    const byConfig = new Map<string, { app: string; descriptors: LeafDescriptorPublic[] }>();
    const fileConfigs = new Map<string, Set<string>>();
    for (const file of inputs) {
        if (file.configs === undefined) {
            continue;
        }
        fileConfigs.set(file.fileId, new Set(file.configs.map((config) => config.configId)));
        for (const config of file.configs) {
            if (!byConfig.has(config.configId)) {
                byConfig.set(config.configId, { app: config.app, descriptors: config.descriptors });
                order.push(config.configId);
            }
        }
    }

    return order.map((configId) => {
        const service = byConfig.get(configId)!;
        const rows: MatrixRow[] = service.descriptors.map((descriptor) => {
            const cells: Record<string, VarStatus | "n/a"> = {};
            for (const column of columns) {
                cells[column.fileId] =
                    fileConfigs.get(column.fileId)?.has(configId) === true
                        ? (statusByFile.get(column.fileId)?.get(descriptor.envName) ?? "n/a")
                        : "n/a";
            }
            return { envName: descriptor.envName, group: descriptor.path.slice(0, -1).join("."), cells };
        });
        return { service: configId, app: service.app, rows };
    });
}
