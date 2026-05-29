import { buildCommand } from "@stricli/core";
import { rotate } from "../rotate.js";

export const rotateCommand = buildCommand<{}, string[]>({
    func: function (_flags, ...envFiles) {
        const result = rotate({ envFiles });
        const { stdout } = this.process;
        for (const file of result.files) {
            stdout.write(`${file.path}: re-encrypted ${file.reEncrypted} secret${file.reEncrypted === 1 ? "" : "s"}\n`);
        }
        stdout.write(`\nNew public key written to ${result.publicKeyPath} (commit this).\n`);
        stdout.write("Share the new private key with your team — it replaces the old one:\n");
        stdout.write(`  ${result.privateKey}\n`);
    },
    parameters: {
        positional: {
            kind: "array",
            parameter: { parse: String, brief: "A .env file whose encrypted values to re-encrypt to the new key", placeholder: "envFile" },
            minimum: 1,
        },
    },
    docs: {
        brief: "Rotate the shared keypair and re-encrypt all secrets to the new key",
        fullDescription:
            "Generates a fresh keypair, decrypts every encrypted value in the given .env files with the current private key, re-encrypts them to the new public key, and overwrites .config/puristic-pub.key. Prints the new private key to redistribute. Requires the current private key.",
    },
});
