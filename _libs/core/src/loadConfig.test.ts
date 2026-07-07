import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractDefinition, loadConfig, NotAnEnvConfigError } from "./loadConfig.js";

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

describe("extractDefinition", () => {
    it("accepts a bare schema and the default/config/definition exports", () => {
        const schema = z.object({ port: z.coerce.number() });
        expect(extractDefinition({ schema }).schema).toBe(schema);
        expect(extractDefinition({ default: { schema, sources: [] } }).schema).toBe(schema);
    });

    it("throws NotAnEnvConfigError for a module that exports no schema (e.g. vite.config)", () => {
        expect(() => extractDefinition({ default: { plugins: [] } })).toThrow(NotAnEnvConfigError);
    });

    it("names the found exports and suggests `export default` when the definition isn't exported", () => {
        expect(() => extractDefinition({ loadConfig: () => ({}), CONFIG_SECRETS: [] })).toThrow(
            /Found: loadConfig, CONFIG_SECRETS\..*export default definition/,
        );
    });
});
