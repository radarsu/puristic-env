import { dirname } from "node:path";
import {
    associateConfigs,
    baseName,
    decrypt,
    dirOf,
    type LeafDescriptorPublic,
    listEntries,
    packageRootOf,
    parseEnv,
    resolvePrivateKey,
} from "@puristic/env/index.js";
import * as vscode from "vscode";
import type { Landscape } from "../../shared/protocol.js";
import type { ConfigHostManager } from "../configHost/manager.js";
import { scanWorkspace, type WorkspaceScan } from "../discovery/scan.js";
import { buildLandscape, type ConfigInput, type FileInput } from "../model/buildLandscape.js";
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
        // The user explicitly opened this document in the env editor, so it must always be manageable —
        // even when the scan misses it (e.g. it sits under a gitignored ancestor directory). It still gets
        // a schema if a config governs its directory; otherwise it falls back to plain key/value editing.
        const fileIds = activeFileId !== "" && !scan.envFileIds.includes(activeFileId) ? [...scan.envFileIds, activeFileId].sort() : scan.envFileIds;
        const association = associateConfigs(fileIds, scan.configIds, scan.packageRootIds);
        const detected = new Map<string, boolean>();
        const introspected = new Map<string, DescriptorResult>();

        const files: FileInput[] = [];
        for (const fileId of fileIds) {
            files.push(await this.buildFileInput(folder, scan, fileId, association.get(fileId) ?? [], detected, introspected));
        }
        const landscape = buildLandscape({ files, activeFileId });
        attachDecryptedSecrets(landscape);
        return landscape;
    }

    private async buildFileInput(
        folder: vscode.WorkspaceFolder,
        scan: WorkspaceScan,
        fileId: string,
        configIds: string[],
        detected: Map<string, boolean>,
        introspected: Map<string, DescriptorResult>,
    ): Promise<FileInput> {
        const uri = toUri(folder, fileId);
        const { text, dirty } = await readText(uri);
        const entries = listEntries(parseEnv(text));
        const base: FileInput = { fileId, fileName: baseName(fileId), dirId: dirOf(fileId), dirty, text, entries };

        const values = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
        const configs: ConfigInput[] = [];
        let configError: string | undefined;
        for (const configId of configIds) {
            const client = this.manager.get(toUri(folder, configId).fsPath, dirname(toUri(folder, configId).fsPath));
            if (!(await this.isEnvConfig(client, configId, detected))) {
                continue;
            }
            const descriptors = await this.introspect(client, configId, introspected);
            if ("error" in descriptors) {
                configError ??= descriptors.error;
                continue;
            }
            try {
                const validation = await client.validate(values);
                configs.push({ configId, app: this.appLabel(scan, configId), descriptors, validation });
            } catch (cause) {
                configError ??= (cause as Error).message;
            }
        }

        if (configs.length > 0) {
            return { ...base, configs };
        }
        return configError !== undefined ? { ...base, configError } : base;
    }

    // A candidate config that loads but exports no env schema is skipped silently; one that throws while
    // loading (a broken config) is kept so introspect surfaces the error.
    private async isEnvConfig(client: ReturnType<ConfigHostManager["get"]>, configId: string, cache: Map<string, boolean>): Promise<boolean> {
        const cached = cache.get(configId);
        if (cached !== undefined) {
            return cached;
        }
        let result: boolean;
        try {
            result = await client.detect();
        } catch {
            result = true;
        }
        cache.set(configId, result);
        return result;
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

    // The app a config belongs to: its package's package.json "name", else the package dir basename,
    // else the workspace folder name (a config sitting at the workspace root).
    private appLabel(scan: WorkspaceScan, configId: string): string {
        const packageDir = packageRootOf(dirOf(configId), scan.packageRootIds);
        const name = packageDir === undefined ? undefined : scan.manifestByDir.get(packageDir)?.name;
        if (name !== undefined) {
            return name;
        }
        const dir = packageDir ?? dirOf(configId);
        return dir === "" ? scan.folder.name : baseName(dir);
    }
}
