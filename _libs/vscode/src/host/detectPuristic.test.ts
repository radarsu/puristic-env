import { describe, expect, it } from "vitest";
import { usesPuristic } from "./detectPuristic.js";

describe("usesPuristic", () => {
    it("is true when a env.config file exists", () => {
        expect(usesPuristic([], ["env.config.ts"])).toBe(true);
    });

    it("is true when a package depends on an @puristic package", () => {
        expect(usesPuristic([{ dependencies: { "@puristic/env": "workspace:*" } }], [])).toBe(true);
        expect(usesPuristic([{ devDependencies: { "@puristic/env": "1.0.0" } }], [])).toBe(true);
    });

    it("is false for an unrelated workspace", () => {
        expect(usesPuristic([{ dependencies: { zod: "4.0.0" } }], [])).toBe(false);
    });
});
