import type { ConfigDefinition } from "@confederation/core/index.js";
import { z } from "zod";

// Fixture used by the config-host integration test and as a sample of the convention:
// export the raw ConfigDefinition (schema + sources), NOT loadConfig(...) — loadConfig
// loads immediately and would throw on encrypted secrets without a private key.
export default {
    schema: z.object({
        nodeEnv: z.string(),
        requestId: z.uuid().optional(),
        startedAt: z.iso.datetime().optional(),
        supportPhone: z.e164().optional(),
        apiKey: z.base64().optional(),
        server: z.object({
            port: z.coerce.number().int(),
            host: z.ipv4().default("0.0.0.0"),
        }),
        database: z.object({
            url: z.url().meta({ secret: true }),
        }),
    }),
    sources: [],
} satisfies ConfigDefinition<z.ZodType>;
