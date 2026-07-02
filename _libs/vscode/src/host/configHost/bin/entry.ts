import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { ConfigHostRequest, ConfigHostResponse } from "../protocol.js";

// Runs as a forked Node 24 process (never the extension host). It evaluates the user's
// env.config.* via Node's native TS type-stripping and answers introspect/validate
// over the fork IPC channel. @puristic/env and the user's config are resolved relative to
// the config file so they share one zod instance (so `.meta({secret})` registry lookups resolve).

interface CoreApi {
    inspectSchema: (schema: unknown) => unknown;
    validateValues: (schema: unknown, values: Record<string, string>) => unknown;
    extractDefinition: (module: Record<string, unknown>) => Definition;
    NotAnEnvConfigError: new (message?: string) => Error;
}

interface Definition {
    schema: unknown;
}

const configPath = process.argv[2];
let core: CoreApi | undefined;
let loaded: { core: CoreApi; definition: Definition } | undefined;

process.on("message", (raw: ConfigHostRequest) => {
    void handle(raw).then((response) => {
        process.send?.(response);
    });
});

async function handle(request: ConfigHostRequest): Promise<ConfigHostResponse> {
    try {
        if (request.op === "ping") {
            return { id: request.id, ok: true, op: "ping" };
        }
        if (request.op === "detect") {
            return { id: request.id, ok: true, op: "detect", isEnv: await detect() };
        }
        const { core: api, definition } = await load();
        if (request.op === "introspect") {
            return { id: request.id, ok: true, op: "introspect", descriptors: api.inspectSchema(definition.schema) as never };
        }
        return { id: request.id, ok: true, op: "validate", report: api.validateValues(definition.schema, request.values) as never };
    } catch (cause) {
        const error = cause as Error & { code?: string };
        return {
            id: request.id,
            ok: false,
            op: request.op,
            error: { kind: error.code ?? "error", message: error.message, ...(error.stack !== undefined ? { stack: error.stack } : {}) },
        };
    }
}

// True if this file is an env config. A module that loads but exports no schema is not one
// (NotAnEnvConfigError) — a silent skip; any other failure (syntax error, throwing import) propagates.
async function detect(): Promise<boolean> {
    const api = await loadCore();
    try {
        await load();
        return true;
    } catch (cause) {
        if (cause instanceof api.NotAnEnvConfigError) {
            return false;
        }
        throw cause;
    }
}

async function loadCore(): Promise<CoreApi> {
    if (core !== undefined) {
        return core;
    }
    if (configPath === undefined) {
        throw new Error("config-host: no config path provided");
    }
    const require = createRequire(pathToFileURL(configPath));
    const coreUrl = pathToFileURL(require.resolve("@puristic/env/index.js")).href;
    core = (await import(coreUrl)) as unknown as CoreApi;
    return core;
}

async function load(): Promise<{ core: CoreApi; definition: Definition }> {
    if (loaded !== undefined) {
        return loaded;
    }
    const api = await loadCore();
    const module = (await import(pathToFileURL(configPath as string).href)) as Record<string, unknown>;
    loaded = { core: api, definition: api.extractDefinition(module) };
    return loaded;
}
