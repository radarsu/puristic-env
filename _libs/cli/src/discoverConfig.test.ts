import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findGoverningConfig } from "./discoverConfig.js";

let dir: string;

function write(relative: string, content = ""): string {
    const target = join(dir, relative);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
    return target;
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "puristic-discover-"));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe("findGoverningConfig", () => {
    it("finds a config sitting beside the start directory", () => {
        const config = write("env.config.ts");
        write("package.json", "{}");
        expect(findGoverningConfig(dir)).toBe(config);
    });

    it("finds a config nested in src/ from the package root", () => {
        write("package.json", "{}");
        const config = write("src/env.config.ts");
        expect(findGoverningConfig(dir)).toBe(config);
    });

    it("resolves a config nested deeper than src/", () => {
        write("package.json", "{}");
        const config = write("src/config/env.config.ts");
        expect(findGoverningConfig(dir)).toBe(config);
    });

    it("prefers the .ts source over a compiled dist config", () => {
        write("package.json", "{}");
        const source = write("src/env.config.ts");
        write("dist/env.config.js");
        expect(findGoverningConfig(dir)).toBe(source);
    });

    it("does not pull a config out of a nested package", () => {
        write("package.json", "{}");
        write("packages/inner/package.json", "{}");
        write("packages/inner/src/env.config.ts");
        expect(findGoverningConfig(dir)).toBeUndefined();
    });

    it("returns undefined when no config governs the directory", () => {
        write("package.json", "{}");
        expect(findGoverningConfig(dir)).toBeUndefined();
    });
});
