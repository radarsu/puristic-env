import { buildCommand } from "@stricli/core";
import { keygen } from "../keygen.js";

export const keygenCommand = buildCommand({
    func: function () {
        const result = keygen();
        const { stdout } = this.process;
        stdout.write(`Public key written to ${result.publicKeyPath} (commit this).\n`);
        stdout.write(`Project: ${result.projectName}\n`);
        stdout.write("\n");
        stdout.write("Private key (do NOT commit, do NOT paste into chat tools):\n");
        stdout.write(`  ${result.privateKey}\n`);
        stdout.write("\n");
        stdout.write("Save it via one of:\n");
        stdout.write("  - PURISTIC_PRIVATE_KEY env var (CI / production)\n");
        stdout.write(`  - file at ${result.suggestedPrivateKeyPath} (default lookup path, chmod 600)\n`);
    },
    parameters: { positional: { kind: "tuple", parameters: [] } },
    docs: {
        brief: "Generate ML-KEM-512 keypair; write public key file; print private key",
        fullDescription:
            "Generates a fresh post-quantum keypair (ML-KEM-512). Writes the public key to .config/puristic-pub.key (commit this), and prints the private key to stdout with storage instructions. Refuses to overwrite an existing public key.",
    },
});
