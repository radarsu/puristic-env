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
}

interface Definition {
    schema: unknown;
}

const configPath = process.argv[2];
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
        const { core, definition } = await load();
        if (request.op === "introspect") {
            return { id: request.id, ok: true, op: "introspect", descriptors: core.inspectSchema(definition.schema) as never };
        }
        return { id: request.id, ok: true, op: "validate", report: core.validateValues(definition.schema, request.values) as never };
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

async function load(): Promise<{ core: CoreApi; definition: Definition }> {
    if (loaded !== undefined) {
        return loaded;
    }
    if (configPath === undefined) {
        throw new Error("config-host: no config path provided");
    }
    const configUrl = pathToFileURL(configPath);
    const require = createRequire(configUrl);
    const coreUrl = pathToFileURL(require.resolve("@puristic/env/index.js")).href;
    const core = (await import(coreUrl)) as unknown as CoreApi;
    const module = (await import(configUrl.href)) as Record<string, unknown>;
    loaded = { core, definition: core.extractDefinition(module) };
    return loaded;
}
