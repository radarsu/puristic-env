import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
    decrypt,
    encrypt,
    generateKeypair,
    isEnvelope,
    listEntries,
    PUBLIC_KEY_PATH,
    parseEnv,
    resolvePrivateKey,
    serializeEnv,
    setValue,
} from "@puristic/env/index.js";

export interface RotateOptions {
    envFiles: string[];
    cwd?: string;
}

export interface RotateResult {
    privateKey: string;
    publicKeyPath: string;
    files: { path: string; reEncrypted: number }[];
}

// Rotate the shared project keypair: decrypt every encrypted value with the current private key,
// re-encrypt it to a freshly generated public key, and replace the committed public key. The new
// private key is returned for the team to redistribute (anyone with the old key keeps prior copies,
// so rotation is how a departing teammate loses access to future values).
export function rotate(options: RotateOptions): RotateResult {
    const cwd = options.cwd ?? process.cwd();
    const oldKey = resolvePrivateKey();
    const next = generateKeypair();
    const files = options.envFiles.map((file) => reEncryptFile(cwd, resolve(cwd, file), oldKey, next.publicKey));

    const publicKeyPath = join(cwd, PUBLIC_KEY_PATH);
    mkdirSync(dirname(publicKeyPath), { recursive: true });
    writeFileSync(publicKeyPath, `${next.publicKey}\n`, { mode: 0o644 });
    return { privateKey: next.privateKey, publicKeyPath, files };
}

function reEncryptFile(cwd: string, envPath: string, oldKey: Uint8Array, newPublicKey: string): { path: string; reEncrypted: number } {
    if (!existsSync(envPath)) {
        throw new Error(`File not found: ${envPath}`);
    }
    let doc = parseEnv(readFileSync(envPath, "utf8"));
    let reEncrypted = 0;
    for (const entry of listEntries(doc)) {
        if (!isEnvelope(entry.value)) {
            continue;
        }
        doc = setValue(doc, entry.key, encrypt(decrypt(entry.value, oldKey), newPublicKey));
        reEncrypted++;
    }
    if (reEncrypted > 0) {
        writeFileSync(envPath, serializeEnv(doc));
    }
    return { path: relative(cwd, envPath), reEncrypted };
}
