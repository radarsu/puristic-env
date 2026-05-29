import { decrypt as decryptEnvelope, resolvePrivateKey } from "@puristic/env/index.js";

export function decrypt(envelope: string): string {
    return decryptEnvelope(envelope, resolvePrivateKey());
}
