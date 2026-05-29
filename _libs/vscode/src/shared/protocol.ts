// The shapes exchanged between the extension host and the webview. Both sides import from here.
// VarStatus (the per-variable status vocabulary) is owned by @puristic/env and reused here.

import type { VarStatus } from "@puristic/env/index.js";

export type BadgeStatus = "ok" | "warn" | "error" | "none";

export type ControlType = "text" | "number" | "boolean";

export interface VarRow {
    envName: string;
    path: string[];
    displayName: string;
    group: string;
    typeLabel: string;
    control: ControlType;
    format?: string;
    pattern?: string;
    min?: number;
    max?: number;
    step?: number;
    minLength?: number;
    maxLength?: number;
    required: boolean;
    hasDefault: boolean;
    defaultValue?: string;
    secret: boolean;
    enumValues?: string[];
    present: boolean;
    rawValue?: string;
    isEncrypted: boolean;
    status: VarStatus;
    message?: string;
}

export interface FileView {
    fileId: string;
    fileName: string;
    dirId: string;
    dirty: boolean;
    hasSchema: boolean;
    configError?: string;
    rows: VarRow[];
    missingRequired: number;
    invalid: number;
    unknown: number;
    badge: BadgeStatus;
}

export interface DirView {
    dirId: string;
    label: string;
    configPath?: string;
    fileIds: string[];
    badge: BadgeStatus;
}

export interface MatrixColumn {
    fileId: string;
    dirId: string;
    fileName: string;
}

export interface MatrixRow {
    envName: string;
    group: string;
    cells: Record<string, VarStatus | "n/a">;
}

export interface MatrixSection {
    service: string;
    rows: MatrixRow[];
}

export interface Landscape {
    dirs: DirView[];
    files: Record<string, FileView>;
    columns: MatrixColumn[];
    matrix: MatrixSection[];
    activeFileId: string;
}

export type HostToWebview =
    | { type: "hydrate"; landscape: Landscape }
    | { type: "landscapeUpdated"; landscape: Landscape }
    | { type: "fileDirtyChanged"; fileId: string; dirty: boolean }
    | { type: "revealSecretResult"; requestId: string; fileId: string; envName: string; ok: boolean; value?: string; message?: string }
    | { type: "actionError"; requestId?: string; message: string };

export type WebviewToHost =
    | { type: "ready" }
    | { type: "navigateToFile"; fileId: string; focusEnvName?: string }
    | { type: "setValue"; fileId: string; envName: string; value: string }
    | { type: "addKey"; fileId: string; envName: string; value: string }
    | { type: "addAllMissing"; fileId: string }
    | { type: "copyFromPreset"; fileId: string }
    | { type: "removeKey"; fileId: string; envName: string }
    | { type: "resetToDefault"; fileId: string; envName: string }
    | { type: "encryptSecret"; fileId: string; envName: string; plaintext: string }
    | { type: "revealSecret"; requestId: string; fileId: string; envName: string }
    | { type: "saveFile"; fileId: string }
    | { type: "saveAll" }
    | { type: "openAsPlainText"; fileId: string }
    | { type: "encryptAllSecrets"; fileId: string };
