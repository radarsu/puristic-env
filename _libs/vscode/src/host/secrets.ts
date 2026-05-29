import { decrypt, encrypt, resolvePrivateKey, resolvePublicKey } from "@puristic/env/index.js";

// Encryption needs only the project's public key (resolved by walking up to the nearest
// package.json, mirroring core's runtime resolution) — no private key, no subprocess.
export function encryptForProject(plaintext: string, projectDir: string): string {
    return encrypt(plaintext, resolvePublicKey(projectDir));
}

// Revealing a secret requires a configured private key (PURISTIC_PRIVATE_KEY / file / default path).
export function decryptValue(envelope: string): string {
    return decrypt(envelope, resolvePrivateKey());
}
