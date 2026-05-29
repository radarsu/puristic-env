import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeafDescriptorPublic, ValidationReport } from "@puristic/env/index.js";
import { describe, expect, it } from "vitest";
import { classifyEnv, validate } from "./validate.js";

function descriptor(envName: string, overrides: Partial<LeafDescriptorPublic> = {}): LeafDescriptorPublic {
    return {
        path: [envName.toLowerCase()],
        envName,
        cliName: `--${envName.toLowerCase()}`,
        type: "string",
        coerce: false,
        required: true,
        optional: false,
        nullable: false,
        hasDefault: false,
        secret: false,
        constraints: [],
        ...overrides,
    };
}

const descriptors = [
    descriptor("NODE_ENV"),
    descriptor("SERVER_HOST", { required: false, hasDefault: true, default: "0.0.0.0" }),
    descriptor("DATABASE_URL", { secret: true }),
];
const report: ValidationReport = { leaves: [{ envName: "NODE_ENV", path: ["nodeEnv"], ok: true }] };

function statuses(rows: { envName: string; status: string }[]): Record<string, string> {
    return Object.fromEntries(rows.map((row) => [row.envName, row.status]));
}

describe("classifyEnv", () => {
    it("classifies present / defaulted / missing-secret / unknown", () => {
        const { rows, errorCount, warningCount } = classifyEnv(descriptors, { NODE_ENV: "production", LEGACY_FLAG: "1" }, report, false);
        expect(statuses(rows)).toEqual({
            NODE_ENV: "ok",
            SERVER_HOST: "using-default",
            DATABASE_URL: "missing-required",
            LEGACY_FLAG: "unknown",
        });
        expect(errorCount).toBe(1);
        expect(warningCount).toBe(1);
    });

    it("escalates unknown keys to errors under --strict", () => {
        const { errorCount, warningCount } = classifyEnv(descriptors, { NODE_ENV: "production", LEGACY_FLAG: "1" }, report, true);
        expect(errorCount).toBe(2);
        expect(warningCount).toBe(0);
    });

    it("treats an encrypted secret as ok and a plaintext secret as an error", () => {
        const encrypted = classifyEnv([descriptor("DATABASE_URL", { secret: true })], { DATABASE_URL: "encrypted:v1:abc" }, { leaves: [] }, false);
        expect(encrypted.rows[0]?.status).toBe("secret-encrypted");
        expect(encrypted.errorCount).toBe(0);

        const plaintext = classifyEnv([descriptor("DATABASE_URL", { secret: true })], { DATABASE_URL: "postgres://plain" }, { leaves: [] }, false);
        expect(plaintext.rows[0]?.status).toBe("secret-plaintext");
        expect(plaintext.errorCount).toBe(1);
    });
});

describe("validate (against the api fixture)", () => {
    const fixtureDir = fileURLToPath(new URL("../../vscode/fixtures/api", import.meta.url));

    it("matches the editor's classification across .env and .env.local", async () => {
        const result = await validate({ envFiles: [join(fixtureDir, ".env"), join(fixtureDir, ".env.local")], strict: false, cwd: fixtureDir });
        const byPath = new Map(result.files.map((file) => [file.path, statuses(file.rows)]));

        expect(byPath.get(".env")).toMatchObject({ DATABASE_URL: "secret-encrypted", SERVER_HOST: "using-default" });
        expect(byPath.get(".env.local")).toMatchObject({ DATABASE_URL: "missing-required", LEGACY_FLAG: "unknown" });
        expect(result.ok).toBe(false);
    });

    it("exits clean when only .env (with the encrypted secret) is validated", async () => {
        const result = await validate({ envFiles: [join(fixtureDir, ".env")], strict: false, cwd: fixtureDir });
        expect(result.ok).toBe(true);
        expect(result.errorCount).toBe(0);
    });
});
