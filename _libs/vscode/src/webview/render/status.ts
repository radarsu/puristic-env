import type { VarStatus } from "@puristic/env/index.js";

export const STATUS_LABEL: Record<VarStatus, string> = {
    ok: "OK",
    "missing-required": "Missing",
    "using-default": "Default",
    invalid: "Invalid",
    unknown: "Unknown",
    "secret-encrypted": "Encrypted",
    "secret-plaintext": "Plaintext",
    "no-schema": "—",
};

export const STATUS_ICON: Record<VarStatus, string> = {
    ok: "✓",
    "missing-required": "✕",
    "using-default": "·",
    invalid: "✕",
    unknown: "?",
    "secret-encrypted": "🔒",
    "secret-plaintext": "⚠",
    "no-schema": "",
};
