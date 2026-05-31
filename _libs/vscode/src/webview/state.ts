import type { Landscape } from "../shared/protocol.js";

export type ViewMode = "grid" | "matrix" | "raw";

export interface AppState {
    landscape: Landscape | undefined;
    selectedFileId: string | undefined;
    mode: ViewMode;
    filter: string;
    // When true, secret values are shown in plaintext (the host supplies decrypted values). A toggle flips it.
    revealSecrets: boolean;
    error: string | undefined;
}

export interface PersistedState {
    selectedFileId: string | undefined;
    mode: ViewMode;
    filter: string;
    revealSecrets: boolean;
}
