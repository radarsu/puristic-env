import { buildCommand } from "@stricli/core";
import { gen } from "../gen.js";

interface GenFlags {
    config?: string;
    out?: string;
    types: boolean;
    example: boolean;
    json: boolean;
    force: boolean;
}

export const genCommand = buildCommand<GenFlags, []>({
    func: async function (flags) {
        const explicit = flags.types || flags.example || flags.json;
        const result = await gen({
            types: explicit ? flags.types : true,
            example: explicit ? flags.example : true,
            json: flags.json,
            force: flags.force,
            ...(flags.config === undefined ? {} : { config: flags.config }),
            ...(flags.out === undefined ? {} : { out: flags.out }),
        });
        for (const path of result.written) {
            this.process.stdout.write(`Wrote ${path}\n`);
        }
    },
    parameters: {
        flags: {
            config: {
                kind: "parsed",
                parse: String,
                brief: "Path to env.config.* (defaults to the nearest one above the current directory)",
                optional: true,
            },
            out: { kind: "parsed", parse: String, brief: "Output directory (defaults to the config file's directory)", optional: true },
            types: { kind: "boolean", brief: "Generate puristic-env.d.ts", default: false },
            example: { kind: "boolean", brief: "Generate .env.example", default: false },
            json: { kind: "boolean", brief: "Generate puristic.schema.json", default: false },
            force: { kind: "boolean", brief: "Overwrite files that are not puristic-generated artifacts", default: false },
        },
        positional: { kind: "tuple", parameters: [] },
    },
    docs: {
        brief: "Generate typed .d.ts, a .env.example, and JSON Schema from your config",
        fullDescription:
            "Reads the env.config.* schema and writes a typed puristic-env.d.ts (a NodeJS.ProcessEnv augmentation plus a PuristicConfig interface) and a .env.example. Pass --json to also emit puristic.schema.json. With no artifact flags, generates types and the example. Output goes next to the config unless --out is given.",
    },
});
