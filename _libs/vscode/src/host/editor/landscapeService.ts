import { dirname } from "node:path";
import { associateConfigs, baseName, decrypt, dirOf, type LeafDescriptorPublic, listEntries, parseEnv, resolvePrivateKey } from "@puristic/env/index.js";
import * as vscode from "vscode";
import type { Landscape } from "../../shared/protocol.js";
import type { ConfigHostManager } from "../configHost/manager.js";
import { scanWorkspace } from "../discovery/scan.js";
import { buildLandscape, type FileInput } from "../model/buildLandscape.js";
import { readText, toUri } from "./uris.js";

type DescriptorResult = LeafDescriptorPublic[] | { error: string };

// Fill VarRow.decrypted so the webview can show secrets in plaintext by default. Plaintext secrets need
// no key; encrypted ones are decrypted with the project's private key, resolved once. A missing key leaves
// encrypted secrets masked (privateKeyAvailable = false); a single bad envelope is skipped, not fatal.
function attachDecryptedSecrets(landscape: Landscape): void {
    let key: Uint8Array | undefined;
    let keyResolved = false;
    for (const file of Object.values(landscape.files)) {
        for (const row of file.rows) {
            if (!row.secret || row.rawValue === undefined) {
                continue;
            }
            if (!row.isEncrypted) {
                row.decrypted = row.rawValue;
                continue;
            }
            if (!keyResolved) {
                keyResolved = true;
                try {
                    key = resolvePrivateKey();
                    landscape.privateKeyAvailable = true;
                } catch {
                    return;
                }
            }
            if (key === undefined) {
                return;
            }
            try {
                row.decrypted = decrypt(row.rawValue, key);
            } catch {
                // Wrong key or corrupt envelope — leave it masked.
            }
        }
    }
}

export class LandscapeService {
    constructor(private readonly manager: ConfigHostManager) {}

    async build(folder: vscode.WorkspaceFolder, activeFileId: string): Promise<Landscape> {
        const scan = await scanWorkspace(folder);
        const association = associateConfigs(scan.envFileIds, scan.configIds);
        const cache = new Map<string, DescriptorResult>();

        const files: FileInput[] = [];
        for (const fileId of scan.envFileIds) {
            files.push(await this.buildFileInput(folder, fileId, association.get(fileId), cache));
        }
        const landscape = buildLandscape({ files, activeFileId });
        attachDecryptedSecrets(landscape);
        return landscape;
    }

    private async buildFileInput(
        folder: vscode.WorkspaceFolder,
        fileId: string,
        configId: string | undefined,
        cache: Map<string, DescriptorResult>,
    ): Promise<FileInput> {
        const uri = toUri(folder, fileId);
        const { text, dirty } = await readText(uri);
        const entries = listEntries(parseEnv(text));
        const base: FileInput = { fileId, fileName: baseName(fileId), dirId: dirOf(fileId), dirty, text, entries };
        if (configId === undefined) {
            return base;
        }

        const configAbsolute = toUri(folder, configId).fsPath;
        const client = this.manager.get(configAbsolute, dirname(configAbsolute));

        const descriptors = await this.introspect(client, configId, cache);
        if ("error" in descriptors) {
            return { ...base, configId, configError: descriptors.error };
        }

        const values = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
        try {
            const validation = await client.validate(values);
            return { ...base, configId, descriptors, validation };
        } catch (cause) {
            return { ...base, configId, configError: (cause as Error).message };
        }
    }

    private async introspect(
        client: ReturnType<ConfigHostManager["get"]>,
        configId: string,
        cache: Map<string, DescriptorResult>,
    ): Promise<DescriptorResult> {
        const cached = cache.get(configId);
        if (cached !== undefined) {
            return cached;
        }
        let result: DescriptorResult;
        try {
            result = await client.introspect();
        } catch (cause) {
            result = { error: (cause as Error).message };
        }
        cache.set(configId, result);
        return result;
    }
}
