import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigHostClient } from "./client.js";

// vitest runs under the workspace Node 24, so we fork the .ts entry directly (native type-stripping)
// rather than the bundled dist — this exercises the real subprocess end to end.
const here = dirname(fileURLToPath(import.meta.url));
const entryPath = join(here, "bin", "entry.ts");
const fixtureDir = join(here, "..", "..", "..", "fixtures", "api");
const configPath = join(fixtureDir, "confederation.config.ts");

function makeClient(): ConfigHostClient {
    return new ConfigHostClient({ entryPath, configPath, projectRoot: fixtureDir, nodePath: process.execPath, timeoutMs: 15000 });
}

describe("ConfigHostClient", () => {
    let client: ConfigHostClient | undefined;

    afterEach(() => {
        client?.dispose();
        client = undefined;
    });

    it("introspects the fixture config into env descriptors", async () => {
        client = makeClient();
        const descriptors = await client.introspect();
        const byEnv = new Map(descriptors.map((descriptor) => [descriptor.envName, descriptor]));
        expect([...byEnv.keys()].sort()).toEqual([
            "API_KEY",
            "DATABASE_URL",
            "NODE_ENV",
            "REQUEST_ID",
            "SERVER_HOST",
            "SERVER_PORT",
            "STARTED_AT",
            "SUPPORT_PHONE",
        ]);
        expect(byEnv.get("SERVER_PORT")?.type).toBe("number");
        expect(byEnv.get("SERVER_HOST")?.hasDefault).toBe(true);
        expect(byEnv.get("DATABASE_URL")?.secret).toBe(true);
        const requestId = byEnv.get("REQUEST_ID");
        expect(requestId?.type).toBe("string");
        expect(requestId?.constraints.find((constraint) => constraint.kind === "format")?.regex?.source).toBeTruthy();
    });

    it("validates values against the fixture schema", async () => {
        client = makeClient();
        const report = await client.validate({ NODE_ENV: "production", SERVER_PORT: "8080", DATABASE_URL: "https://x.test" });
        const port = report.leaves.find((leaf) => leaf.envName === "SERVER_PORT");
        expect(port?.ok).toBe(true);

        const bad = await client.validate({ SERVER_PORT: "abc" });
        expect(bad.leaves.find((leaf) => leaf.envName === "SERVER_PORT")?.ok).toBe(false);
        expect(bad.leaves.find((leaf) => leaf.envName === "NODE_ENV")?.ok).toBe(false);
    });

    it("reports a structured error when the config path is invalid", async () => {
        client = new ConfigHostClient({
            entryPath,
            configPath: join(fixtureDir, "does-not-exist.config.ts"),
            projectRoot: fixtureDir,
            nodePath: process.execPath,
            timeoutMs: 15000,
        });
        await expect(client.introspect()).rejects.toThrow();
    });
});
