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
        expect(result.get("apps/api/.env")).toEqual(["apps/api/env.config.ts"]);
        expect(result.get("apps/api/.env.local")).toEqual(["apps/api/env.config.ts"]);
        expect(result.get("apps/web/.env")).toEqual(["env.config.ts"]);
        expect(result.get("scripts/.env")).toEqual(["env.config.ts"]);
    });

    it("leaves a .env unassociated when no config governs it", () => {
        const result = associateConfigs(["a/.env"], ["b/env.config.ts"], []);
        expect(result.get("a/.env")).toEqual([]);
    });

    it("lets a config in src/ govern its package-root .env", () => {
        const result = associateConfigs(["apps/api/.env.local"], ["apps/api/src/env.config.ts"], ["apps/api"]);
        expect(result.get("apps/api/.env.local")).toEqual(["apps/api/src/env.config.ts"]);
    });

    it("resolves a config nested deeper than src/", () => {
        const result = associateConfigs(["apps/gw/.env.local"], ["apps/gw/src/config/env.config.ts"], ["apps/gw"]);
        expect(result.get("apps/gw/.env.local")).toEqual(["apps/gw/src/config/env.config.ts"]);
    });

    it("prefers the .ts source over a compiled dist config in the same package", () => {
        const result = associateConfigs(["apps/api/.env.local"], ["apps/api/dist/env.config.js", "apps/api/src/env.config.ts"], ["apps/api"]);
        expect(result.get("apps/api/.env.local")).toEqual(["apps/api/src/env.config.ts"]);
    });

    it("keeps the deeper package's config when packages nest", () => {
        const result = associateConfigs(
            ["apps/api/.env", "apps/api/inner/.env"],
            ["apps/api/src/env.config.ts", "apps/api/inner/src/env.config.ts"],
            ["apps/api", "apps/api/inner"],
        );
        expect(result.get("apps/api/.env")).toEqual(["apps/api/src/env.config.ts"]);
        expect(result.get("apps/api/inner/.env")).toEqual(["apps/api/inner/src/env.config.ts"]);
    });

    it("binds a single root .env to every descendant app config (shared-root topology)", () => {
        const result = associateConfigs([".env"], ["_apps/api/src/config.ts", "_apps/web/src/config.ts"], ["_apps/api", "_apps/web"]);
        expect(result.get(".env")).toEqual(["_apps/api/src/config.ts", "_apps/web/src/config.ts"]);
    });

    it("excludes an app with its own .env from the root set", () => {
        const result = associateConfigs(
            [".env", "_apps/api/.env"],
            ["_apps/api/src/config.ts", "_apps/web/src/config.ts"],
            ["_apps/api", "_apps/web"],
        );
        expect(result.get(".env")).toEqual(["_apps/web/src/config.ts"]);
        expect(result.get("_apps/api/.env")).toEqual(["_apps/api/src/config.ts"]);
    });

    it("includes a root config alongside descendant app configs for the root .env", () => {
        const result = associateConfigs([".env"], ["config.ts", "_apps/api/src/config.ts"], ["_apps/api"]);
        expect(result.get(".env")).toEqual(["config.ts", "_apps/api/src/config.ts"]);
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
