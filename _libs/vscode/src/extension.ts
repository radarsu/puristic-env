import * as vscode from "vscode";
import { ConfigHostManager } from "./host/configHost/manager.js";
import { usesPuristic } from "./host/detectPuristic.js";
import { scanWorkspace } from "./host/discovery/scan.js";
import { encryptAllSecrets } from "./host/editor/encryptAllSecrets.js";
import { EnvEditorProvider } from "./host/editor/envEditorProvider.js";
import { LandscapeService } from "./host/editor/landscapeService.js";
import { isEnvUri, relativeId } from "./host/editor/uris.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const entryPath = vscode.Uri.joinPath(context.extensionUri, "dist", "configHost.mjs").fsPath;
    const manager = new ConfigHostManager(entryPath);
    const landscape = new LandscapeService(manager);

    context.subscriptions.push(
        { dispose: () => manager.disposeAll() },
        vscode.window.registerCustomEditorProvider(EnvEditorProvider.viewType, new EnvEditorProvider(context, manager, landscape), {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false,
        }),
        vscode.commands.registerCommand("puristic.rescan", () => {
            manager.disposeAll();
            void updateContext();
        }),
        vscode.commands.registerCommand("puristic.openEnvManager", openEnvManager),
        vscode.commands.registerCommand("puristic.openAsPlainText", openAsPlainText),
        vscode.commands.registerCommand("puristic.encryptAllSecrets", () => encryptAllSecretsCommand(landscape)),
        vscode.workspace.onDidChangeWorkspaceFolders(() => void updateContext()),
    );

    await updateContext();
}

export function deactivate(): void {}

async function updateContext(): Promise<void> {
    await vscode.commands.executeCommand("setContext", "puristic.isPuristicRepo", await detect());
}

async function detect(): Promise<boolean> {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const scan = await scanWorkspace(folder);
        if (usesPuristic(scan.manifests, scan.configIds)) {
            return true;
        }
    }
    return false;
}

function openEnvManager(): void {
    const uri = activeTabUri();
    if (uri !== undefined && isEnvUri(uri)) {
        void vscode.commands.executeCommand("vscode.openWith", uri, EnvEditorProvider.viewType);
        return;
    }
    void vscode.window.showInformationMessage("Open a .env file first, then run “Puristic: Open Env Manager”.");
}

function openAsPlainText(): void {
    const uri = activeTabUri();
    if (uri !== undefined) {
        void vscode.commands.executeCommand("vscode.openWith", uri, "default");
    }
}

async function encryptAllSecretsCommand(landscape: LandscapeService): Promise<void> {
    const uri = activeTabUri();
    if (uri === undefined || !isEnvUri(uri)) {
        void vscode.window.showInformationMessage("Open a .env file first, then run “Puristic: Encrypt All Plaintext Secrets”.");
        return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined) {
        return;
    }
    const count = await encryptAllSecrets(landscape, folder, relativeId(folder, uri));
    void vscode.window.showInformationMessage(`Encrypted ${count} secret${count === 1 ? "" : "s"}.`);
}

function activeTabUri(): vscode.Uri | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) {
        return input.uri;
    }
    return undefined;
}
