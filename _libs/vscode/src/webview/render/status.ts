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
    // secret-encrypted renders the monochrome lock SVG (icon("lock")) at the call sites, not a glyph.
    "secret-encrypted": "",
    "secret-plaintext": "⚠",
    "no-schema": "",
};
