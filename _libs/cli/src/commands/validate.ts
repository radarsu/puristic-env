import { buildCommand } from "@stricli/core";
import type { CliContext } from "../context.js";
import { renderHuman, renderJson } from "../renderValidate.js";
import { validate } from "../validate.js";

interface ValidateFlags {
    config?: string;
    strict: boolean;
    json: boolean;
}

export const validateCommand = buildCommand<ValidateFlags, string[], CliContext>({
    func: async function (flags, ...envFiles) {
        const result = await validate({ envFiles, strict: flags.strict, ...(flags.config === undefined ? {} : { configPath: flags.config }) });
        this.process.stdout.write(flags.json ? renderJson(result) : renderHuman(result));
        if (!result.ok) {
            this.process.exitCode = 1;
        }
    },
    parameters: {
        flags: {
            config: {
                kind: "parsed",
                parse: String,
                brief: "Use this env.config.* for every file (overrides nearest-ancestor discovery)",
                optional: true,
            },
            strict: { kind: "boolean", brief: "Treat unknown keys (present in .env, absent from the schema) as errors", default: false },
            json: { kind: "boolean", brief: "Emit a machine-readable JSON report", default: false },
        },
        positional: {
            kind: "array",
            parameter: {
                parse: String,
                brief: "A .env file to validate (defaults to all .env* under the current directory)",
                placeholder: "envFile",
            },
        },
    },
    docs: {
        brief: "Validate .env files against their env.config schema",
        fullDescription:
            "Loads the env.config.* governing each .env file, then reports every variable as ok / missing-required / using-default / invalid / unknown / secret-* — the same status model as the VSCode editor. Exits non-zero when any error-level status is found, so it can gate CI and pre-commit hooks.",
    },
});
