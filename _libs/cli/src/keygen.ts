import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultPrivateKeyPath, generateKeypair, PUBLIC_KEY_PATH, resolveProjectName } from "@puristic/env/index.js";

export interface KeygenResult {
    publicKeyPath: string;
    privateKey: string;
    suggestedPrivateKeyPath: string;
    projectName: string;
}

export function keygen(cwd: string = process.cwd()): KeygenResult {
    const projectName = resolveProjectName(cwd);
    const publicKeyPath = join(cwd, PUBLIC_KEY_PATH);
    if (existsSync(publicKeyPath)) {
        throw new Error(`Refusing to overwrite existing public key at ${publicKeyPath}. Delete it first if you really want to regenerate.`);
    }
    const { publicKey, privateKey } = generateKeypair();
    mkdirSync(dirname(publicKeyPath), { recursive: true });
    writeFileSync(publicKeyPath, `${publicKey}\n`, { mode: 0o644 });
    return {
        publicKeyPath,
        privateKey,
        suggestedPrivateKeyPath: defaultPrivateKeyPath(cwd),
        projectName,
    };
}
