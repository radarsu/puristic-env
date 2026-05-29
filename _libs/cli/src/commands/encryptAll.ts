import { buildCommand } from "@stricli/core";
import { encryptAll } from "../encryptAll.js";

export const encryptAllCommand = buildCommand<{ config?: string }, string[]>({
    func: async function (flags, ...envFiles) {
        const result = await encryptAll({ envFiles, ...(flags.config === undefined ? {} : { config: flags.config }) });
        for (const file of result.files) {
            this.process.stdout.write(`${file.path}: encrypted ${file.encrypted} secret${file.encrypted === 1 ? "" : "s"}\n`);
        }
    },
    parameters: {
        flags: {
            config: {
                kind: "parsed",
                parse: String,
                brief: "Use this env.config.* (defaults to the nearest one above each file)",
                optional: true,
            },
        },
        positional: {
            kind: "array",
            parameter: { parse: String, brief: "A .env file whose plaintext secret values to encrypt", placeholder: "envFile" },
            minimum: 1,
        },
    },
    docs: {
        brief: "Encrypt all plaintext secret values in one or more .env files",
        fullDescription:
            "For each file, loads the governing env.config.* to find which keys are secret (.meta({ secret: true })), then encrypts every plaintext secret value in place with the project public key. Already-encrypted values are left untouched and comments/order/quotes are preserved. Needs only the public key.",
    },
});
