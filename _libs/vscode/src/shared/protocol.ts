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
    // Plaintext for display: the raw value for plaintext secrets, or the decrypted value for encrypted
    // ones (set in the host only when a private key is available). Undefined when it cannot be revealed.
    decrypted?: string;
    status: VarStatus;
    message?: string;
}

export interface FileView {
    fileId: string;
    fileName: string;
    dirId: string;
    dirty: boolean;
    // Raw file contents, shown verbatim in the "File" (raw text) tab.
    text: string;
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
    // False when no private key is configured, so encrypted secrets stay masked and the UI shows a hint.
    privateKeyAvailable: boolean;
}

export type HostToWebview =
    | { type: "hydrate"; landscape: Landscape }
    | { type: "landscapeUpdated"; landscape: Landscape }
    | { type: "fileDirtyChanged"; fileId: string; dirty: boolean }
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
    | { type: "setFileText"; fileId: string; text: string }
    | { type: "discardChanges"; fileId: string }
    | { type: "saveFile"; fileId: string }
    | { type: "saveAll" }
    | { type: "openAsPlainText"; fileId: string }
    | { type: "encryptAllSecretsWorkspace" }
    | { type: "undo" }
    | { type: "redo" };
