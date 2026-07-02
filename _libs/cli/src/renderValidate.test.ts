import { describe, expect, it } from "vitest";
import { renderHuman, renderJson } from "./renderValidate.js";
import type { ValidateResult } from "./validate.js";

const sample: ValidateResult = {
    ok: false,
    errorCount: 1,
    warningCount: 1,
    configErrors: [],
    files: [
        {
            path: ".env",
            configPaths: ["_apps/api/src/config.ts", "_apps/web/src/config.ts"],
            rows: [
                { envName: "DATABASE_URL", status: "missing-required", message: "Required secret is missing", apps: ["api"] },
                { envName: "API_URL", status: "ok", apps: ["api", "web"], shared: true },
                { envName: "LEGACY_FLAG", status: "unknown", message: "Not defined in any schema" },
            ],
            errorCount: 1,
            warningCount: 1,
        },
    ],
};

describe("renderHuman", () => {
    it("shows the file, its schemas, statuses, and shared-app tags", () => {
        const out = renderHuman(sample);
        expect(out).toContain(".env  (config: _apps/api/src/config.ts, _apps/web/src/config.ts)");
        expect(out).toContain("MISSING");
        expect(out).toContain("DATABASE_URL");
        expect(out).toContain("[api, web]");
        expect(out).toContain("✗ 1 error, 1 warning");
        expect(out).toContain("1 file, 1 error, 1 warning");
    });

    it("reports an empty result", () => {
        expect(renderHuman({ ok: true, errorCount: 0, warningCount: 0, configErrors: [], files: [] })).toBe("No .env files found.\n");
    });

    it("surfaces a config that failed to load", () => {
        const out = renderHuman({
            ok: true,
            errorCount: 0,
            warningCount: 1,
            files: [],
            configErrors: [{ path: "_apps/api/broken.config.ts", error: "Unexpected token" }],
        });
        expect(out).toContain("_apps/api/broken.config.ts  (config failed to load)");
        expect(out).toContain("Unexpected token");
    });
});

describe("renderJson", () => {
    it("emits the result as JSON, omitting absent optional fields", () => {
        const parsed = JSON.parse(renderJson(sample));
        expect(parsed.ok).toBe(false);
        expect(parsed.files[0].rows[0]).toEqual({
            envName: "DATABASE_URL",
            status: "missing-required",
            message: "Required secret is missing",
            apps: ["api"],
        });
        expect(parsed.files[0].rows[1]).toEqual({ envName: "API_URL", status: "ok", apps: ["api", "web"], shared: true });
        expect("formError" in parsed.files[0]).toBe(false);
    });
});
