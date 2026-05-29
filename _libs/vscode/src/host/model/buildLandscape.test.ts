import { inspectSchema, validateValues } from "@confederation/core/index.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FileView, VarRow } from "../../shared/protocol.js";
import { buildLandscape, type FileInput } from "./buildLandscape.js";

const schema = z.object({
    nodeEnv: z.string(),
    server: z.object({ port: z.coerce.number().int(), host: z.string().default("0.0.0.0") }),
    database: z.object({ url: z.url().meta({ secret: true }) }),
});

const descriptors = inspectSchema(schema);

function file(fileId: string, values: Record<string, string>, overrides: Partial<FileInput> = {}): FileInput {
    return {
        fileId,
        fileName: fileId.slice(fileId.lastIndexOf("/") + 1),
        dirId: fileId.slice(0, fileId.lastIndexOf("/")),
        dirty: false,
        entries: Object.entries(values).map(([key, value]) => ({ key, value })),
        configId: "apps/api/confederation.config.ts",
        descriptors,
        validation: validateValues(schema, values),
        ...overrides,
    };
}

function row(view: FileView, envName: string): VarRow {
    const found = view.rows.find((entry) => entry.envName === envName);
    if (found === undefined) {
        throw new Error(`no row ${envName}`);
    }
    return found;
}

describe("buildLandscape", () => {
    it("classifies each variable's status", () => {
        const input = file("apps/api/.env", {
            SERVER_PORT: "not-a-number",
            DATABASE_URL: "encrypted:v1:abc",
            EXTRA: "1",
        });
        const landscape = buildLandscape({ files: [input], activeFileId: input.fileId });
        const view = landscape.files["apps/api/.env"]!;

        expect(row(view, "NODE_ENV").status).toBe("missing-required");
        expect(row(view, "SERVER_PORT").status).toBe("invalid");
        expect(row(view, "SERVER_HOST").status).toBe("using-default");
        expect(row(view, "DATABASE_URL").status).toBe("secret-encrypted");
        expect(row(view, "EXTRA").status).toBe("unknown");
        expect(view.badge).toBe("error");
        expect(view.hasSchema).toBe(true);
    });

    it("warns when a secret is stored as plaintext", () => {
        const input = file("apps/api/.env", { NODE_ENV: "dev", SERVER_PORT: "1", DATABASE_URL: "https://plain" });
        const view = buildLandscape({ files: [input], activeFileId: input.fileId }).files["apps/api/.env"]!;
        expect(row(view, "DATABASE_URL").status).toBe("secret-plaintext");
    });

    it("reports ok for a complete, valid file", () => {
        const input = file("apps/api/.env", { NODE_ENV: "production", SERVER_PORT: "8080", DATABASE_URL: "encrypted:v1:zzz" });
        const view = buildLandscape({ files: [input], activeFileId: input.fileId }).files["apps/api/.env"]!;
        expect(view.badge).toBe("ok");
        expect(view.missingRequired).toBe(0);
        expect(view.invalid).toBe(0);
    });

    it("treats files without a schema as plain editable keys", () => {
        const input: FileInput = {
            fileId: "misc/.env",
            fileName: ".env",
            dirId: "misc",
            dirty: false,
            entries: [{ key: "FOO", value: "bar" }],
        };
        const view = buildLandscape({ files: [input], activeFileId: input.fileId }).files["misc/.env"]!;
        expect(view.hasSchema).toBe(false);
        expect(view.badge).toBe("none");
        expect(row(view, "FOO").status).toBe("no-schema");
    });

    it("builds a cross-service matrix with n/a where a key does not apply", () => {
        const apiFile = file("apps/api/.env", { NODE_ENV: "production", SERVER_PORT: "8080", DATABASE_URL: "encrypted:v1:z" });
        const otherSchema = z.object({ token: z.string() });
        const otherFile: FileInput = {
            fileId: "apps/web/.env",
            fileName: ".env",
            dirId: "apps/web",
            dirty: false,
            entries: [],
            configId: "apps/web/confederation.config.ts",
            descriptors: inspectSchema(otherSchema),
            validation: validateValues(otherSchema, {}),
        };
        const landscape = buildLandscape({ files: [apiFile, otherFile], activeFileId: apiFile.fileId });
        expect(landscape.columns.map((column) => column.fileId)).toEqual(["apps/api/.env", "apps/web/.env"]);
        expect(landscape.matrix).toHaveLength(2);

        const apiSection = landscape.matrix.find((section) => section.service === "apps/api/confederation.config.ts")!;
        const nodeEnvRow = apiSection.rows.find((entry) => entry.envName === "NODE_ENV")!;
        expect(nodeEnvRow.cells["apps/api/.env"]).toBe("ok");
        expect(nodeEnvRow.cells["apps/web/.env"]).toBe("n/a");
    });

    it("derives input controls and validation attributes from the schema", () => {
        const controlSchema = z.object({
            port: z.coerce.number().int().min(1).max(65535),
            endpoint: z.url(),
            address: z.ipv4(),
            flag: z.coerce.boolean(),
            mode: z.enum(["dev", "prod"]),
            name: z.string(),
        });
        const input: FileInput = {
            fileId: "svc/.env",
            fileName: ".env",
            dirId: "svc",
            dirty: false,
            entries: [],
            configId: "svc/confederation.config.ts",
            descriptors: inspectSchema(controlSchema),
            validation: validateValues(controlSchema, {}),
        };
        const view = buildLandscape({ files: [input], activeFileId: input.fileId }).files["svc/.env"]!;

        const port = row(view, "PORT");
        expect(port.control).toBe("number");
        expect(port.step).toBe(1);
        expect(port.min).toBe(1);
        expect(port.max).toBe(65535);

        const endpoint = row(view, "ENDPOINT");
        expect(endpoint.control).toBe("text");
        expect(endpoint.format).toBe("url");

        const address = row(view, "ADDRESS");
        expect(address.control).toBe("text");
        expect(address.format).toBe("ipv4");
        expect(address.pattern).toBeTruthy();
        expect(address.typeLabel).toBe("string (IPv4)");

        expect(row(view, "FLAG").control).toBe("boolean");
        expect(row(view, "MODE").enumValues).toEqual(["dev", "prod"]);
        expect(row(view, "NAME").control).toBe("text");
    });
});
