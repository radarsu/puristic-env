import { baseName, classify, isEnvelope, type LeafDescriptorPublic, type ValidationReport, type VarStatus } from "@puristic/env/index.js";
import { FORMAT_META } from "../../shared/formats.js";
import type { BadgeStatus, ControlType, DirView, FileView, Landscape, MatrixColumn, MatrixRow, MatrixSection, VarRow } from "../../shared/protocol.js";

export interface FileInput {
    fileId: string;
    fileName: string;
    dirId: string;
    dirty: boolean;
    entries: { key: string; value: string }[];
    configId?: string;
    descriptors?: LeafDescriptorPublic[];
    validation?: ValidationReport;
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
    };
}

function buildFileView(file: FileInput): FileView {
    const entryMap = new Map<string, string>();
    for (const entry of file.entries) {
        entryMap.set(entry.key, entry.value);
    }

    if (file.descriptors === undefined) {
        const rows = file.entries.map((entry) => plainRow(entry.key, entry.value));
        const badge: BadgeStatus = file.configError !== undefined ? "error" : "none";
        const base: FileView = {
            fileId: file.fileId,
            fileName: file.fileName,
            dirId: file.dirId,
            dirty: file.dirty,
            hasSchema: false,
            rows,
            missingRequired: 0,
            invalid: 0,
            unknown: 0,
            badge,
        };
        return file.configError !== undefined ? { ...base, configError: file.configError } : base;
    }

    const validationByEnv = new Map((file.validation?.leaves ?? []).map((leaf) => [leaf.envName, leaf]));
    const knownEnvNames = new Set(file.descriptors.map((descriptor) => descriptor.envName));
    const rows: VarRow[] = [];
    let missingRequired = 0;
    let invalid = 0;

    for (const descriptor of file.descriptors) {
        const rawValue = entryMap.get(descriptor.envName);
        const present = rawValue !== undefined && rawValue !== "";
        const encrypted = rawValue !== undefined && isEnvelope(rawValue);
        const validation = descriptor.secret ? undefined : validationByEnv.get(descriptor.envName);
        const result = classify({
            descriptor,
            present,
            isEncrypted: encrypted,
            validationOk: validation?.ok,
            validationMessage: validation?.message,
        });
        if (result.status === "missing-required") {
            missingRequired++;
        }
        if (result.status === "invalid") {
            invalid++;
        }
        rows.push(buildVarRow(descriptor, rawValue, present, encrypted, result.status, result.message));
    }

    let unknown = 0;
    for (const entry of file.entries) {
        if (knownEnvNames.has(entry.key)) {
            continue;
        }
        unknown++;
        rows.push(plainRow(entry.key, entry.value, "unknown", "Not defined in the schema"));
    }

    const hasFormError = file.validation?.formError !== undefined;
    const badge = computeBadge(rows, hasFormError);
    return {
        fileId: file.fileId,
        fileName: file.fileName,
        dirId: file.dirId,
        dirty: file.dirty,
        hasSchema: true,
        rows,
        missingRequired,
        invalid,
        unknown,
        badge,
    };
}

function buildVarRow(
    descriptor: LeafDescriptorPublic,
    rawValue: string | undefined,
    present: boolean,
    isEncrypted: boolean,
    status: VarStatus,
    message: string | undefined,
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
        constraint.kind === "format" && typeof constraint.value === "string" ? (FORMAT_META[constraint.value]?.label ?? constraint.label) : constraint.label,
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
    const byDir = new Map<string, { fileIds: string[]; configId: string | undefined }>();
    for (const file of inputs) {
        const group = byDir.get(file.dirId);
        if (group === undefined) {
            byDir.set(file.dirId, { fileIds: [file.fileId], configId: file.configId });
            order.push(file.dirId);
            continue;
        }
        group.fileIds.push(file.fileId);
    }
    return order.map((dirId) => {
        const group = byDir.get(dirId) ?? { fileIds: [], configId: undefined };
        const dir: DirView = {
            dirId,
            label: dirId === "" ? "(workspace root)" : baseName(dirId),
            fileIds: group.fileIds,
            badge: worstBadge(group.fileIds.map((fileId) => files[fileId]?.badge ?? "none")),
        };
        if (group.configId !== undefined) {
            dir.configPath = group.configId;
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

function buildMatrix(inputs: FileInput[], columns: MatrixColumn[], statusByFile: Map<string, Map<string, VarStatus>>): MatrixSection[] {
    const serviceOrder: string[] = [];
    const byService = new Map<string, FileInput>();
    for (const file of inputs) {
        if (file.descriptors === undefined || file.configId === undefined) {
            continue;
        }
        if (!byService.has(file.configId)) {
            byService.set(file.configId, file);
            serviceOrder.push(file.configId);
        }
    }

    const fileService = new Map(inputs.filter((file) => file.configId !== undefined).map((file) => [file.fileId, file.configId]));

    return serviceOrder.map((service) => {
        const representative = byService.get(service)!;
        const rows: MatrixRow[] = (representative.descriptors ?? []).map((descriptor) => {
            const cells: Record<string, VarStatus | "n/a"> = {};
            for (const column of columns) {
                cells[column.fileId] =
                    fileService.get(column.fileId) === service ? (statusByFile.get(column.fileId)?.get(descriptor.envName) ?? "n/a") : "n/a";
            }
            return { envName: descriptor.envName, group: descriptor.path.slice(0, -1).join("."), cells };
        });
        return { service, rows };
    });
}
