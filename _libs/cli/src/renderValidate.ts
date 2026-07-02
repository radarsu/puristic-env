import type { VarStatus } from "@puristic/env/index.js";
import type { ValidateFileResult, ValidateResult, ValidateRow } from "./validate.js";

const STATUS_LABEL: Record<VarStatus, string> = {
    ok: "ok",
    "missing-required": "MISSING",
    "using-default": "default",
    invalid: "INVALID",
    unknown: "unknown",
    "secret-encrypted": "encrypted",
    "secret-plaintext": "PLAINTEXT",
    "no-schema": "no-schema",
};

export function renderJson(result: ValidateResult): string {
    return `${JSON.stringify(result, null, 2)}\n`;
}

export function renderHuman(result: ValidateResult): string {
    if (result.files.length === 0 && result.configErrors.length === 0) {
        return "No .env files found.\n";
    }
    const lines: string[] = [];
    for (const file of result.files) {
        lines.push("", header(file));
        if (file.configPaths.length === 0) {
            lines.push("  (no env config governs this file — skipped)");
        } else {
            for (const row of file.rows) {
                lines.push(renderRow(row));
            }
            if (file.formError !== undefined) {
                lines.push(`  form error: ${file.formError}`);
            }
        }
        lines.push(`  ${summaryMark(file.errorCount, file.warningCount)}`);
    }
    for (const configError of result.configErrors) {
        lines.push("", `${configError.path}  (config failed to load)`, `  ${configError.error}`);
    }
    lines.push("", totals(result));
    return `${lines.join("\n")}\n`;
}

function header(file: ValidateFileResult): string {
    return file.configPaths.length === 0 ? file.path : `${file.path}  (config: ${file.configPaths.join(", ")})`;
}

function renderRow(row: ValidateRow): string {
    const label = STATUS_LABEL[row.status].padEnd(10);
    const name = row.envName.padEnd(24);
    const apps = row.shared === true && row.apps !== undefined ? `  [${row.apps.join(", ")}]` : "";
    const message = row.message === undefined ? "" : `  ${row.message}`;
    return `  ${label} ${name}${apps}${message}`.trimEnd();
}

function summaryMark(errorCount: number, warningCount: number): string {
    const mark = errorCount > 0 ? "✗" : "✓";
    return `${mark} ${plural(errorCount, "error")}, ${plural(warningCount, "warning")}`;
}

function totals(result: ValidateResult): string {
    return `${plural(result.files.length, "file")}, ${plural(result.errorCount, "error")}, ${plural(result.warningCount, "warning")}`;
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
