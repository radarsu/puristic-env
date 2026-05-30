import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "./loadConfig.js";

describe("loadConfig", () => {
    it("returns the loaded value directly", () => {
        const config = loadConfig({
            schema: z.object({ port: z.coerce.number().default(3000) }),
            sources: [{ name: "override", load: () => ({ port: "8080" }) }],
        });
        expect(config.port).toBe(8080);
        expect(Object.isFrozen(config)).toBe(true);
    });

    it("throws on invalid input", () => {
        expect(() =>
            loadConfig({
                schema: z.object({ port: z.coerce.number().int().min(1) }),
                sources: [{ name: "bad", load: () => ({ port: "abc" }) }],
            }),
        ).toThrow(z.ZodError);
    });
});
