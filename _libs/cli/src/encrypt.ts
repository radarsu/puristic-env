import { encrypt as encryptValue, resolvePublicKey } from "@puristic/env/index.js";

export function encrypt(plaintext: string, cwd: string = process.cwd()): string {
    return encryptValue(plaintext, resolvePublicKey(cwd));
}
