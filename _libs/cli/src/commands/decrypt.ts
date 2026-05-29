import { buildCommand } from "@stricli/core";
import { decrypt } from "../decrypt.js";

export const decryptCommand = buildCommand<{}, [string]>({
    func: function (_flags, envelope) {
        this.process.stdout.write(`${decrypt(envelope)}\n`);
    },
    parameters: {
        positional: { kind: "tuple", parameters: [{ parse: String, brief: "An encrypted:v1: envelope to decrypt", placeholder: "envelope" }] },
    },
    docs: {
        brief: "Decrypt a single encrypted value using the project private key",
        fullDescription:
            "Reads the configured private key (PURISTIC_PRIVATE_KEY env var, PURISTIC_PRIVATE_KEY_FILE, or the default key path) and prints the decrypted plaintext of the given encrypted:v1: envelope.",
    },
});
