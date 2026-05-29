import { buildCommand } from "@stricli/core";
import { encrypt } from "../encrypt.js";

export const encryptCommand = buildCommand<{}, [string]>({
    func: function (_flags, plaintext) {
        this.process.stdout.write(`${encrypt(plaintext)}\n`);
    },
    parameters: {
        positional: {
            kind: "tuple",
            parameters: [
                {
                    brief: "Plaintext value to encrypt with the project public key",
                    parse: String,
                    placeholder: "plaintext",
                },
            ],
        },
    },
    docs: {
        brief: "Encrypt a value with the project public key",
        fullDescription:
            "Reads .config/puristic-pub.key, encrypts the provided plaintext with ML-KEM-512 + AES-256-GCM, and prints the resulting `encrypted:v1:...` envelope. Paste the output into a .env file as the secret value.",
    },
});
