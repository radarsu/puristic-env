import { dirname } from "node:path";
import { associateConfigs, baseName, dirOf, type LeafDescriptorPublic, listEntries, parseEnv } from "@puristic/env/index.js";
import * as vscode from "vscode";
import type { Landscape } from "../../shared/protocol.js";
import type { ConfigHostManager } from "../configHost/manager.js";
import { scanWorkspace } from "../discovery/scan.js";
import { buildLandscape, type FileInput } from "../model/buildLandscape.js";
import { readText, toUri } from "./uris.js";

type DescriptorResult = LeafDescriptorPublic[] | { error: string };

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
        return buildLandscape({ files, activeFileId });
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
        const base: FileInput = { fileId, fileName: baseName(fileId), dirId: dirOf(fileId), dirty, entries };
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
