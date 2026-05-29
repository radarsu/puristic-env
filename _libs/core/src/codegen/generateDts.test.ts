import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inspectSchema } from "../inspectSchema.js";
import { generateDts } from "./generateDts.js";

const descriptors = inspectSchema(
    z.object({
        nodeEnv: z.string(),
        mode: z.enum(["dev", "prod"]).optional(),
        server: z.object({
            port: z.coerce.number().int(),
            host: z.string().default("0.0.0.0"),
        }),
        database: z.object({
            url: z.url().meta({ secret: true }),
        }),
    }),
);

describe("generateDts", () => {
    const out = generateDts(descriptors, { source: "env.config.ts" });

    it("augments NodeJS.ProcessEnv with raw string values", () => {
        expect(out).toContain("namespace NodeJS {");
        expect(out).toContain("interface ProcessEnv {");
        expect(out).toContain("NODE_ENV: string;");
        expect(out).toContain("SERVER_PORT: string;");
        expect(out).toContain("SERVER_HOST?: string;");
        expect(out).toContain("DATABASE_URL: string;");
    });

    it("renders enums as raw string-literal unions", () => {
        expect(out).toContain('MODE?: "dev" | "prod";');
    });

    it("emits a nested, coerced PuristicConfig interface", () => {
        expect(out).toContain("export interface PuristicConfig {");
        expect(out).toContain("server: {");
        expect(out).toContain("port: number;");
        expect(out).toContain("host?: string;");
        expect(out).toContain("url: string;");
        expect(out).toContain('mode?: "dev" | "prod";');
    });
});
