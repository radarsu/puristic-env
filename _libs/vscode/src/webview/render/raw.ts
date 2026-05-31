import type { FileView } from "../../shared/protocol.js";
import { clear, h } from "../dom.js";

// Inline-editable view of the file's raw .env text (comments, blank lines, and order preserved). Edits commit
// after a short debounce / on blur via the "set-file-text" action, writing the whole document through the same
// WorkspaceEdit path as every other field — so dirty/undo/save stay native.
//
// Syntax highlighting uses the overlay technique: a transparent-text <textarea> sits on top of a <pre> that
// holds colorized tokens, both sharing identical box metrics. The webview keeps them in sync on input/scroll.
export function renderRaw(file: FileView): HTMLElement {
    const highlight = h("pre", { class: "raw-highlight", "aria-hidden": "true" });
    highlightInto(highlight, file.text);
    const textarea = h("textarea", {
        class: "raw",
        "data-action": "set-file-text",
        "data-file": file.fileId,
        spellcheck: "false",
        wrap: "off",
        text: file.text,
    });
    return h("div", { class: "raw-wrap" }, [highlight, textarea]);
}

// Matches an assignment line: leading ws, optional `export `, KEY, `=` (with surrounding ws), then the value.
const ASSIGNMENT = /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/;
const ENVELOPE_PREFIX = "encrypted:v1:";

// Rebuild the highlight layer from `text`. Tokens are appended as <span> nodes via textContent (never
// innerHTML), so file contents can't inject markup under the webview CSP. Newlines are kept verbatim so the
// <pre> mirrors the textarea line-for-line; a trailing newline keeps their heights matched.
export function highlightInto(pre: HTMLElement, text: string): void {
    clear(pre);
    const lines = text.split("\n");
    lines.forEach((line, index) => {
        appendLine(pre, line);
        if (index < lines.length - 1) {
            pre.append("\n");
        }
    });
    pre.append("\n");
}

function appendLine(pre: HTMLElement, line: string): void {
    if (line.trim().startsWith("#")) {
        pre.append(tok("comment", line));
        return;
    }
    const match = ASSIGNMENT.exec(line);
    if (match === null) {
        pre.append(line);
        return;
    }
    const [, lead, exportKw, key, op, value] = match;
    if (lead !== undefined && lead !== "") {
        pre.append(lead);
    }
    if (exportKw !== undefined) {
        pre.append(tok("kw", exportKw));
    }
    pre.append(tok("key", key ?? ""));
    pre.append(tok("op", op ?? ""));
    if (value !== undefined && value !== "") {
        pre.append(tok(value.startsWith(ENVELOPE_PREFIX) ? "envelope" : "value", value));
    }
}

function tok(kind: string, text: string): HTMLElement {
    return h("span", { class: `tok-${kind}`, text });
}
