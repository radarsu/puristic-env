import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inspectSchema, type LeafDescriptorPublic } from "./inspectSchema.js";

function byEnv(descriptors: LeafDescriptorPublic[], envName: string): LeafDescriptorPublic {
    const found = descriptors.find((descriptor) => descriptor.envName === envName);
    if (found === undefined) {
        throw new Error(`no descriptor for ${envName}`);
    }
    return found;
}

describe("inspectSchema", () => {
    it("derives env and cli names per leaf", () => {
        const descriptors = inspectSchema(
            z.object({
                nodeEnv: z.string(),
                server: z.object({ httpsPort: z.coerce.number() }),
            }),
        );
        expect(descriptors.map((d) => d.envName)).toEqual(["NODE_ENV", "SERVER_HTTPS_PORT"]);
        expect(byEnv(descriptors, "SERVER_HTTPS_PORT").cliName).toBe("server-https-port");
    });

    it("reports type, coerce, and constraints", () => {
        const descriptors = inspectSchema(
            z.object({
                port: z.coerce.number().int().min(1).max(65535),
                url: z.url(),
                name: z.string().min(3),
            }),
        );
        const port = byEnv(descriptors, "PORT");
        expect(port.type).toBe("number");
        expect(port.coerce).toBe(true);
        expect(port.constraints.map((c) => c.label)).toEqual(["int", ">= 1", "<= 65535"]);

        expect(byEnv(descriptors, "URL").constraints.map((c) => c.label)).toEqual(["url"]);
        expect(byEnv(descriptors, "NAME").constraints.map((c) => c.label)).toEqual(["min length 3"]);
    });

    it("surfaces the compiled regex on string-format constraints", () => {
        const descriptors = inspectSchema(z.object({ address: z.ipv4(), id: z.uuid() }));
        const address = byEnv(descriptors, "ADDRESS");
        expect(address.type).toBe("string");
        const format = address.constraints.find((c) => c.kind === "format");
        expect(format?.value).toBe("ipv4");
        expect(format?.regex?.source).toBeTruthy();
        expect(new RegExp(format!.regex!.source).test("192.168.1.1")).toBe(true);
        expect(new RegExp(format!.regex!.source).test("not-an-ip")).toBe(false);
    });

    it("classifies required, optional, default, and nullable", () => {
        const descriptors = inspectSchema(
            z.object({
                required: z.string(),
                opt: z.string().optional(),
                withDefault: z.string().default("hello"),
                nul: z.string().nullable(),
            }),
        );
        expect(byEnv(descriptors, "REQUIRED").required).toBe(true);

        const opt = byEnv(descriptors, "OPT");
        expect(opt.required).toBe(false);
        expect(opt.optional).toBe(true);

        const withDefault = byEnv(descriptors, "WITH_DEFAULT");
        expect(withDefault.required).toBe(false);
        expect(withDefault.hasDefault).toBe(true);
        expect(withDefault.default).toBe("hello");

        const nul = byEnv(descriptors, "NUL");
        expect(nul.nullable).toBe(true);
        expect(nul.required).toBe(true);
    });

    it("flags secret leaves from meta", () => {
        const descriptors = inspectSchema(z.object({ apiKey: z.string().meta({ secret: true }) }));
        const apiKey = byEnv(descriptors, "API_KEY");
        expect(apiKey.secret).toBe(true);
        expect(apiKey.meta).toEqual({ secret: true });
    });

    it("captures enum values", () => {
        const descriptors = inspectSchema(z.object({ mode: z.enum(["dev", "prod"]) }));
        const mode = byEnv(descriptors, "MODE");
        expect(mode.type).toBe("enum");
        expect(mode.enumValues).toEqual(["dev", "prod"]);
    });

    it("omits non-serializable defaults but keeps hasDefault", () => {
        const descriptors = inspectSchema(z.object({ when: z.coerce.date().default(() => new Date(0)) }));
        const when = byEnv(descriptors, "WHEN");
        expect(when.hasDefault).toBe(true);
        expect(when.default).toBeUndefined();
    });
});
