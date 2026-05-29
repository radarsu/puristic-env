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
    if (result.files.length === 0) {
        return "No .env files found.\n";
    }
    const lines: string[] = [];
    for (const file of result.files) {
        lines.push("", header(file));
        if (file.configError !== undefined) {
            lines.push(`  config error: ${file.configError}`);
        } else if (file.configPath === undefined) {
            lines.push("  (no governing env.config.* — skipped)");
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
    lines.push("", totals(result));
    return `${lines.join("\n")}\n`;
}

function header(file: ValidateFileResult): string {
    return file.configPath === undefined ? file.path : `${file.path}  (config: ${file.configPath})`;
}

function renderRow(row: ValidateRow): string {
    const label = STATUS_LABEL[row.status].padEnd(10);
    const name = row.envName.padEnd(24);
    const message = row.message === undefined ? "" : `  ${row.message}`;
    return `  ${label} ${name}${message}`.trimEnd();
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
