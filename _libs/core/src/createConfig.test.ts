import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createConfig } from "./createConfig.js";
import type { Source } from "./source.js";
import { cliArgs } from "./sources/cliArgs.js";
import { env } from "./sources/env.js";

function fixed(name: string, data: Record<string, unknown>): Source {
    return { name, load: () => data };
}

describe("createConfig", () => {
    it("throws from get() before load()", () => {
        const handle = createConfig({
            schema: z.object({ port: z.coerce.number().default(3000) }),
            sources: [],
        });
        expect(() => handle.get()).toThrow(/not loaded/);
    });

    it("returns the parsed value from load() and caches it for get()", () => {
        const handle = createConfig({
            schema: z.object({ port: z.coerce.number().default(3000) }),
            sources: [fixed("override", { port: "8080" })],
        });
        const loaded = handle.load();
        expect(loaded.port).toBe(8080);
        expect(handle.get()).toBe(loaded);
    });

    it("freezes the returned config", () => {
        const handle = createConfig({
            schema: z.object({ server: z.object({ port: z.coerce.number().default(3000) }).default({}) }),
            sources: [],
        });
        const loaded = handle.load();
        expect(Object.isFrozen(loaded)).toBe(true);
        expect(Object.isFrozen(loaded.server)).toBe(true);
    });

    it("re-load replaces holder", () => {
        const handle = createConfig({
            schema: z.object({ port: z.coerce.number().default(3000) }),
            sources: [fixed("first", { port: "1111" })],
        });
        const first = handle.load();
        expect(first.port).toBe(1111);
        const second = handle.load();
        expect(second.port).toBe(1111);
        expect(handle.get()).toBe(second);
    });

    it("lets ZodError propagate from invalid input", () => {
        const handle = createConfig({
            schema: z.object({ port: z.coerce.number().int().min(1) }),
            sources: [fixed("bad", { port: "not-a-number" })],
        });
        expect(() => handle.load()).toThrow(z.ZodError);
    });

    it("end-to-end: schema-derived names with env source", () => {
        const handle = createConfig({
            schema: z.object({
                nodeEnv: z.string(),
                server: z.object({
                    port: z.coerce.number().int(),
                    host: z.string().default("0.0.0.0"),
                }),
                database: z.object({
                    url: z.string().url(),
                }),
            }),
            sources: [
                env({
                    source: {
                        NODE_ENV: "production",
                        SERVER_PORT: "8080",
                        SERVER_HOST: "10.0.0.1",
                        DATABASE_URL: "postgres://user:pass@host/db",
                    },
                }),
            ],
        });
        const config = handle.load();
        expect(config.nodeEnv).toBe("production");
        expect(config.server.port).toBe(8080);
        expect(config.server.host).toBe("10.0.0.1");
        expect(config.database.url).toBe("postgres://user:pass@host/db");
    });

    it("cliArgs overrides env for the same leaf; env passes through where CLI is silent", () => {
        const handle = createConfig({
            schema: z.object({
                server: z.object({
                    port: z.coerce.number().int(),
                    host: z.string(),
                }),
            }),
            sources: [env({ source: { SERVER_PORT: "1111", SERVER_HOST: "127.0.0.1" } }), cliArgs({ argv: ["--server-port", "2222"] })],
        });
        const config = handle.load();
        expect(config.server.port).toBe(2222);
        expect(config.server.host).toBe("127.0.0.1");
    });
});
