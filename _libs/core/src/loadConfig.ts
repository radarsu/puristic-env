import { pathToFileURL } from "node:url";
import type { z } from "zod";
import type { ConfigDefinition } from "./createConfig.js";

// Extract a ConfigDefinition from an imported env.config.* module via the export
// convention: a `default`/`config`/`definition` export carrying a `schema`, or a bare `schema`
// export. The extension's config-host and the CLI both rely on this single implementation.
export function extractDefinition(module: Record<string, unknown>): ConfigDefinition<z.ZodType> {
    const candidate = module["default"] ?? module["config"] ?? module["definition"];
    if (isDefinition(candidate)) {
        return candidate;
    }
    if (isZodSchema(candidate)) {
        return { schema: candidate, sources: [] };
    }
    const bare = module["schema"];
    if (isZodSchema(bare)) {
        return { schema: bare, sources: [] };
    }
    throw new Error(
        "env.config must export a ConfigDefinition (default, `config`, or `definition`) with a `schema`, or a bare zod `schema` export.",
    );
}

// Evaluate the user's env.config.* in-process via Node 24 native TS type-stripping and
// extract its definition. The CLI uses this directly (it runs on Node 24); errors propagate.
export async function loadDefinition(configPath: string): Promise<ConfigDefinition<z.ZodType>> {
    const module = (await import(pathToFileURL(configPath).href)) as Record<string, unknown>;
    return extractDefinition(module);
}

function isDefinition(value: unknown): value is ConfigDefinition<z.ZodType> {
    return typeof value === "object" && value !== null && isZodSchema((value as { schema?: unknown }).schema);
}

function isZodSchema(value: unknown): value is z.ZodType {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    return "_zod" in value || typeof (value as { safeParse?: unknown }).safeParse === "function";
}
