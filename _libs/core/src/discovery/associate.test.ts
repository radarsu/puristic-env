import { describe, expect, it } from "vitest";
import { associateConfigs } from "./associate.js";
import { groupByDirectory } from "./groupByDirectory.js";

describe("associateConfigs", () => {
    it("matches each .env to its nearest ancestor config", () => {
        const result = associateConfigs(
            ["apps/api/.env", "apps/api/.env.local", "apps/web/.env", "scripts/.env"],
            ["env.config.ts", "apps/api/env.config.ts"],
            [],
        );
        expect(result.get("apps/api/.env")).toBe("apps/api/env.config.ts");
        expect(result.get("apps/api/.env.local")).toBe("apps/api/env.config.ts");
        expect(result.get("apps/web/.env")).toBe("env.config.ts");
        expect(result.get("scripts/.env")).toBe("env.config.ts");
    });

    it("leaves a .env unassociated when no config governs it", () => {
        const result = associateConfigs(["a/.env"], ["b/env.config.ts"], []);
        expect(result.get("a/.env")).toBeUndefined();
    });

    it("lets a config in src/ govern its package-root .env", () => {
        const result = associateConfigs(["apps/api/.env.local"], ["apps/api/src/env.config.ts"], ["apps/api"]);
        expect(result.get("apps/api/.env.local")).toBe("apps/api/src/env.config.ts");
    });

    it("resolves a config nested deeper than src/", () => {
        const result = associateConfigs(["apps/gw/.env.local"], ["apps/gw/src/config/env.config.ts"], ["apps/gw"]);
        expect(result.get("apps/gw/.env.local")).toBe("apps/gw/src/config/env.config.ts");
    });

    it("prefers the .ts source over a compiled dist config in the same package", () => {
        const result = associateConfigs(["apps/api/.env.local"], ["apps/api/dist/env.config.js", "apps/api/src/env.config.ts"], ["apps/api"]);
        expect(result.get("apps/api/.env.local")).toBe("apps/api/src/env.config.ts");
    });

    it("keeps the deeper package's config when packages nest", () => {
        const result = associateConfigs(
            ["apps/api/.env", "apps/api/inner/.env"],
            ["apps/api/src/env.config.ts", "apps/api/inner/src/env.config.ts"],
            ["apps/api", "apps/api/inner"],
        );
        expect(result.get("apps/api/.env")).toBe("apps/api/src/env.config.ts");
        expect(result.get("apps/api/inner/.env")).toBe("apps/api/inner/src/env.config.ts");
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
