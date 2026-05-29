import * as vscode from "vscode";
import type { PackageManifest } from "../detectPuristic.js";

export interface WorkspaceScan {
    folder: vscode.WorkspaceFolder;
    envFileIds: string[];
    configIds: string[];
    manifests: PackageManifest[];
}

export async function scanWorkspace(folder: vscode.WorkspaceFolder): Promise<WorkspaceScan> {
    const config = vscode.workspace.getConfiguration("puristic");
    const envGlob = config.get<string>("envFileGlob") ?? "**/.env*";
    const configGlob = config.get<string>("configFileGlob") ?? "**/env.config.{ts,mts,cts,js,mjs,cjs}";
    const exclude = excludePattern(config.get<string[]>("exclude") ?? []);

    const [envUris, configUris] = await Promise.all([
        vscode.workspace.findFiles(new vscode.RelativePattern(folder, envGlob), exclude),
        vscode.workspace.findFiles(new vscode.RelativePattern(folder, configGlob), exclude),
    ]);

    const envFileIds = envUris.map((uri) => relativeId(folder, uri)).sort();
    const configIds = configUris.map((uri) => relativeId(folder, uri)).sort();
    const manifests = configIds.length > 0 ? [] : await readManifests(folder, exclude);

    return { folder, envFileIds, configIds, manifests };
}

function excludePattern(patterns: string[]): vscode.GlobPattern {
    return patterns.length === 0 ? "**/node_modules/**" : `{${patterns.join(",")}}`;
}

function relativeId(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string {
    return uri.path.slice(folder.uri.path.length).replace(/^\/+/, "");
}

async function readManifests(folder: vscode.WorkspaceFolder, exclude: vscode.GlobPattern): Promise<PackageManifest[]> {
    const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/package.json"), exclude);
    const manifests = await Promise.all(uris.map((uri) => readManifest(uri)));
    return manifests.filter((manifest): manifest is PackageManifest => manifest !== undefined);
}

async function readManifest(uri: vscode.Uri): Promise<PackageManifest | undefined> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return JSON.parse(Buffer.from(bytes).toString("utf8")) as PackageManifest;
    } catch {
        return undefined;
    }
}
