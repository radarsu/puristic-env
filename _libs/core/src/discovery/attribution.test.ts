import { describe, expect, it } from "vitest";
import type { LeafDescriptorPublic } from "../inspectSchema.js";
import type { ValidationReport } from "../validateValues.js";
import { attributeConfigs, mergeValidationReports } from "./attribution.js";

function leaf(envName: string, overrides: Partial<LeafDescriptorPublic> = {}): LeafDescriptorPublic {
    return {
        path: [envName.toLowerCase()],
        envName,
        cliName: envName.toLowerCase(),
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

describe("attributeConfigs", () => {
    it("unions descriptors by envName and records every declaring app", () => {
        const result = attributeConfigs([
            { configId: "api", app: "api", descriptors: [leaf("DATABASE_URL"), leaf("API_URL")] },
            { configId: "web", app: "web", descriptors: [leaf("API_URL"), leaf("WEB_ONLY")] },
        ]);
        expect(result.descriptors.map((descriptor) => descriptor.envName)).toEqual(["DATABASE_URL", "API_URL", "WEB_ONLY"]);
        expect(result.appsByEnv.get("API_URL")).toEqual(["api", "web"]);
        expect(result.appsByEnv.get("DATABASE_URL")).toEqual(["api"]);
        expect(result.conflicts).toEqual([]);
    });

    it("flags a conflict when a shared var has an incompatible definition", () => {
        const result = attributeConfigs([
            { configId: "api", app: "api", descriptors: [leaf("PORT", { type: "number" })] },
            { configId: "web", app: "web", descriptors: [leaf("PORT", { type: "string" })] },
        ]);
        expect(result.conflicts).toEqual([{ envName: "PORT", apps: ["api", "web"] }]);
    });

    it("does not flag a shared var declared identically by both apps", () => {
        const result = attributeConfigs([
            { configId: "api", app: "api", descriptors: [leaf("API_URL", { type: "string" })] },
            { configId: "web", app: "web", descriptors: [leaf("API_URL", { type: "string" })] },
        ]);
        expect(result.conflicts).toEqual([]);
        expect(result.appsByEnv.get("API_URL")).toEqual(["api", "web"]);
    });
});

describe("mergeValidationReports", () => {
    it("lets a failure win over an ok for the same variable", () => {
        const ok: ValidationReport = { leaves: [{ envName: "API_URL", path: ["apiUrl"], ok: true }] };
        const bad: ValidationReport = { leaves: [{ envName: "API_URL", path: ["apiUrl"], ok: false, message: "bad" }] };
        expect(mergeValidationReports([ok, bad]).leaves).toEqual([{ envName: "API_URL", path: ["apiUrl"], ok: false, message: "bad" }]);
    });

    it("concatenates distinct form errors", () => {
        const merged = mergeValidationReports([
            { leaves: [], formError: "e1" },
            { leaves: [], formError: "e1" },
            { leaves: [], formError: "e2" },
        ]);
        expect(merged.formError).toBe("e1; e2");
    });
});
