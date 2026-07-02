import { dirOf } from "@puristic/env/index.js";
import * as vscode from "vscode";
import type { PackageManifest } from "../detectPuristic.js";
import { filterGitignored } from "./gitignore.js";

export interface WorkspaceScan {
    folder: vscode.WorkspaceFolder;
    envFileIds: string[];
    configIds: string[];
    packageRootIds: string[];
    manifests: PackageManifest[];
    // Package-root dir -> its manifest, for resolving a config's app label (package.json "name").
    manifestByDir: Map<string, PackageManifest>;
}

export async function scanWorkspace(folder: vscode.WorkspaceFolder): Promise<WorkspaceScan> {
    const config = vscode.workspace.getConfiguration("puristic");
    const envGlob = config.get<string>("envFileGlob") ?? "**/.env*";
    const configGlob = config.get<string>("configFileGlob") ?? "**/*config.{ts,mts,cts,js,mjs,cjs}";
    const exclude = excludePattern(config.get<string[]>("exclude") ?? []);

    const [envUris, configUris, packageUris] = await Promise.all([
        vscode.workspace.findFiles(new vscode.RelativePattern(folder, envGlob), exclude).then((uris) => filterGitignored(folder, uris)),
        vscode.workspace.findFiles(new vscode.RelativePattern(folder, configGlob), exclude).then((uris) => filterGitignored(folder, uris)),
        vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/package.json"), exclude).then((uris) => filterGitignored(folder, uris)),
    ]);

    const envFileIds = envUris.map((uri) => relativeId(folder, uri)).sort();
    const configIds = configUris.map((uri) => relativeId(folder, uri)).sort();
    const packageRootIds = packageUris.map((uri) => dirOf(relativeId(folder, uri))).sort();
    const manifests = await Promise.all(packageUris.map((uri) => readManifest(uri)));

    const manifestByDir = new Map<string, PackageManifest>();
    packageUris.forEach((uri, index) => {
        const manifest = manifests[index];
        if (manifest !== undefined) {
            manifestByDir.set(dirOf(relativeId(folder, uri)), manifest);
        }
    });

    return {
        folder,
        envFileIds,
        configIds,
        packageRootIds,
        manifests: manifests.filter((manifest): manifest is PackageManifest => manifest !== undefined),
        manifestByDir,
    };
}

function excludePattern(patterns: string[]): vscode.GlobPattern {
    return patterns.length === 0 ? "**/node_modules/**" : `{${patterns.join(",")}}`;
}

function relativeId(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string {
    return uri.path.slice(folder.uri.path.length).replace(/^\/+/, "");
}

async function readManifest(uri: vscode.Uri): Promise<PackageManifest | undefined> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return JSON.parse(Buffer.from(bytes).toString("utf8")) as PackageManifest;
    } catch {
        return undefined;
    }
}
