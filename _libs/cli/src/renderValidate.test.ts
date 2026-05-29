import { describe, expect, it } from "vitest";
import { renderHuman, renderJson } from "./renderValidate.js";
import type { ValidateResult } from "./validate.js";

const sample: ValidateResult = {
    ok: false,
    errorCount: 1,
    warningCount: 1,
    files: [
        {
            path: ".env.local",
            configPath: "env.config.ts",
            rows: [
                { envName: "DATABASE_URL", status: "missing-required", message: "Required secret is missing" },
                { envName: "LEGACY_FLAG", status: "unknown", message: "Not defined in the schema" },
            ],
            errorCount: 1,
            warningCount: 1,
        },
    ],
};

describe("renderHuman", () => {
    it("shows the file, its statuses, and a summary", () => {
        const out = renderHuman(sample);
        expect(out).toContain(".env.local  (config: env.config.ts)");
        expect(out).toContain("MISSING");
        expect(out).toContain("DATABASE_URL");
        expect(out).toContain("✗ 1 error, 1 warning");
        expect(out).toContain("1 file, 1 error, 1 warning");
    });

    it("reports an empty result", () => {
        expect(renderHuman({ ok: true, errorCount: 0, warningCount: 0, files: [] })).toBe("No .env files found.\n");
    });
});

describe("renderJson", () => {
    it("emits the result as JSON, omitting absent optional fields", () => {
        const parsed = JSON.parse(renderJson(sample));
        expect(parsed.ok).toBe(false);
        expect(parsed.files[0].rows[0]).toEqual({ envName: "DATABASE_URL", status: "missing-required", message: "Required secret is missing" });
        expect("configError" in parsed.files[0]).toBe(false);
        expect("formError" in parsed.files[0]).toBe(false);
    });
});
