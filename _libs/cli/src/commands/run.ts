import { buildCommand } from "@stricli/core";
import type { CliContext } from "../context.js";
import { resolveRunEnv, shellQuote, spawnEnv } from "../run.js";

interface RunFlags {
    env?: string[];
    config?: string;
    defaults: boolean;
    print: boolean;
}

export const runCommand = buildCommand<RunFlags, string[], CliContext>({
    func: async function (flags, ...command) {
        const env = await resolveRunEnv({
            ...(flags.env === undefined ? {} : { envFiles: flags.env }),
            ...(flags.config === undefined ? {} : { configPath: flags.config }),
            defaults: flags.defaults,
            onWarn: (message) => this.process.stderr.write(`${message}\n`),
        });

        if (flags.print) {
            for (const [key, value] of Object.entries(env)) {
                this.process.stdout.write(`export ${key}=${shellQuote(value)}\n`);
            }
            return;
        }

        const [program, ...args] = command;
        if (program === undefined) {
            this.process.stderr.write("No command to run. Usage: confederation run [--env <file>]… -- <command> [args…]\n");
            this.process.exitCode = 1;
            return;
        }

        try {
            this.process.exitCode = await spawnEnv(program, args, env, process.cwd());
        } catch (cause) {
            this.process.stderr.write(`Could not run "${program}": ${(cause as Error).message}\n`);
            this.process.exitCode = 127;
        }
    },
    parameters: {
        flags: {
            env: {
                kind: "parsed",
                parse: String,
                variadic: true,
                brief: "A .env file to load (repeatable; later files override earlier). Defaults to .env then .env.local",
                optional: true,
            },
            config: {
                kind: "parsed",
                parse: String,
                brief: "Path to confederation.config.* for --defaults (defaults to the nearest one above the current directory)",
                optional: true,
            },
            defaults: { kind: "boolean", brief: "Inject schema defaults for keys absent from the files and the environment", default: false },
            print: { kind: "boolean", brief: "Print `export KEY=value` lines for `eval` instead of running a command", default: false },
        },
        positional: {
            kind: "array",
            parameter: { parse: String, brief: "The command to run (after --) and its arguments", placeholder: "command" },
        },
    },
    docs: {
        brief: "Populate the environment from .env files and run a command",
        fullDescription:
            "Loads .env (then .env.local), decrypts encrypted secret values, expands $VAR and brace-style variable references against sibling values and the current environment, then runs the given command with those variables injected — replacing hand-rolled `KEY=$(… | envsubst) cmd` one-liners. Put `--` before the command so its own flags pass through verbatim. With --print, emits shell `export` lines for `eval \"$(confederation run --print)\"` instead of running anything.",
    },
});
