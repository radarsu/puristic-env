import { describe, expect, it } from "vitest";
import { associateConfigs } from "./associate.js";
import { groupByDirectory } from "./groupByDirectory.js";

describe("associateConfigs", () => {
    it("matches each .env to its nearest ancestor config", () => {
        const result = associateConfigs(
            ["apps/api/.env", "apps/api/.env.local", "apps/web/.env", "scripts/.env"],
            ["env.config.ts", "apps/api/env.config.ts"],
        );
        expect(result.get("apps/api/.env")).toBe("apps/api/env.config.ts");
        expect(result.get("apps/api/.env.local")).toBe("apps/api/env.config.ts");
        expect(result.get("apps/web/.env")).toBe("env.config.ts");
        expect(result.get("scripts/.env")).toBe("env.config.ts");
    });

    it("leaves a .env unassociated when no config governs it", () => {
        const result = associateConfigs(["a/.env"], ["b/env.config.ts"]);
        expect(result.get("a/.env")).toBeUndefined();
    });
});

describe("groupByDirectory", () => {
    it("groups files by their directory, preserving order", () => {
        const groups = groupByDirectory(["a/.env", "a/.env.local", "b/.env", ".env"]);
        expect(groups.get("a")).toEqual(["a/.env", "a/.env.local"]);
        expect(groups.get("b")).toEqual(["b/.env"]);
        expect(groups.get("")).toEqual([".env"]);
    });
});
