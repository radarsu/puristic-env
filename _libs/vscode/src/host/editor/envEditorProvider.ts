import { dirname } from "node:path";
import * as vscode from "vscode";
import type { HostToWebview, WebviewToHost } from "../../shared/protocol.js";
import type { ConfigHostManager } from "../configHost/manager.js";
import { filterGitignored } from "../discovery/gitignore.js";
import { encryptForProject } from "../secrets.js";
import { copyFromPreset } from "./copyFromPreset.js";
import { addEnvKey, removeEnvKey, revertToSaved, saveDocument, setEnvValue, writeText } from "./documentWrites.js";
import { EditHistory, type Snapshot } from "./editHistory.js";
import { encryptAllSecrets } from "./encryptAllSecrets.js";
import { LandscapeService } from "./landscapeService.js";
import { isEnvUri, relativeId, toUri } from "./uris.js";
import { renderWebviewHtml } from "./webviewHtml.js";

export class EnvEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = "puristic.envEditor";

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly manager: ConfigHostManager,
        private readonly landscape: LandscapeService,
    ) {}

    async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        const distRoot = vscode.Uri.joinPath(this.context.extensionUri, "dist");
        webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [distRoot] };

        if (folder === undefined) {
            webviewPanel.webview.html = "<!DOCTYPE html><body>Open this .env file inside a workspace folder to manage it.</body>";
            return;
        }

        webviewPanel.webview.html = renderWebviewHtml(webviewPanel.webview, distRoot);

        const activeFileId = relativeId(folder, document.uri);
        const post = (message: HostToWebview): void => {
            void webviewPanel.webview.postMessage(message);
        };
        const history = new EditHistory(currentText, writeText);

        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = (): void => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                void this.landscape.build(folder, activeFileId).then((landscape) => post({ type: "landscapeUpdated", landscape }));
            }, 120);
        };

        const disposables: vscode.Disposable[] = [];
        disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (isEnvUri(event.document.uri)) {
                    refresh();
                }
            }),
            vscode.workspace.onDidSaveTextDocument((saved) => {
                if (isEnvUri(saved.uri)) {
                    refresh();
                }
            }),
        );

        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "**/{.env*,env.config.*}"));
        const onFsEvent = async (uri: vscode.Uri): Promise<void> => {
            if ((await filterGitignored(folder, [uri])).length === 0) {
                return;
            }
            if (uri.path.includes("env.config.")) {
                this.manager.restart(uri.fsPath);
            }
            refresh();
        };
        disposables.push(watcher, watcher.onDidChange(onFsEvent), watcher.onDidCreate(onFsEvent), watcher.onDidDelete(onFsEvent));

        disposables.push(
            webviewPanel.webview.onDidReceiveMessage((message: WebviewToHost) => {
                void this.handleMessage(folder, activeFileId, history, message, post);
            }),
        );

        webviewPanel.onDidDispose(() => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
            for (const disposable of disposables) {
                disposable.dispose();
            }
        });
    }

    private async handleMessage(
        folder: vscode.WorkspaceFolder,
        activeFileId: string,
        history: EditHistory,
        message: WebviewToHost,
        post: (message: HostToWebview) => void,
    ): Promise<void> {
        try {
            switch (message.type) {
                case "ready": {
                    const landscape = await this.landscape.build(folder, activeFileId);
                    post({ type: "hydrate", landscape });
                    return;
                }
                case "setValue":
                    await withHistory(history, toUri(folder, message.fileId), (uri) => setEnvValue(uri, message.envName, message.value));
                    return;
                case "addKey":
                    await withHistory(history, toUri(folder, message.fileId), (uri) => addEnvKey(uri, message.envName, message.value));
                    return;
                case "removeKey":
                    await withHistory(history, toUri(folder, message.fileId), (uri) => removeEnvKey(uri, message.envName));
                    return;
                case "resetToDefault":
                    // Removing the override lets puristic apply the schema default at load time.
                    await withHistory(history, toUri(folder, message.fileId), (uri) => removeEnvKey(uri, message.envName));
                    return;
                case "addAllMissing":
                    await withHistory(history, toUri(folder, message.fileId), () => this.addAllMissing(folder, activeFileId, message.fileId));
                    return;
                case "copyFromPreset":
                    await withHistory(history, toUri(folder, message.fileId), () => copyFromPreset(folder, message.fileId));
                    return;
                case "encryptAllSecretsWorkspace":
                    await this.encryptAllSecretsWorkspace(folder, activeFileId, history);
                    return;
                case "encryptSecret":
                    await withHistory(history, toUri(folder, message.fileId), (uri) =>
                        setEnvValue(uri, message.envName, encryptForProject(message.plaintext, dirname(uri.fsPath))),
                    );
                    return;
                case "setFileText":
                    await withHistory(history, toUri(folder, message.fileId), (uri) => writeText(uri, message.text));
                    return;
                case "discardChanges":
                    await withHistory(history, toUri(folder, message.fileId), (uri) => revertToSaved(uri));
                    return;
                case "undo":
                    await history.undo();
                    return;
                case "redo":
                    await history.redo();
                    return;
                case "saveFile":
                    await saveDocument(toUri(folder, message.fileId));
                    return;
                case "saveAll":
                    await Promise.all(vscode.workspace.textDocuments.filter((doc) => isEnvUri(doc.uri) && doc.isDirty).map((doc) => doc.save()));
                    return;
                case "openAsPlainText":
                    await vscode.commands.executeCommand("vscode.openWith", toUri(folder, message.fileId), "default");
                    return;
                case "navigateToFile":
                    return;
            }
        } catch (cause) {
            post({ type: "actionError", message: (cause as Error).message });
        }
    }

    private async addAllMissing(folder: vscode.WorkspaceFolder, activeFileId: string, fileId: string): Promise<void> {
        const landscape = await this.landscape.build(folder, activeFileId);
        const view = landscape.files[fileId];
        if (view === undefined) {
            return;
        }
        const uri = toUri(folder, fileId);
        for (const row of view.rows) {
            if (row.status === "missing-required" || row.status === "using-default") {
                await addEnvKey(uri, row.envName, row.defaultValue ?? "");
            }
        }
    }

    // Encrypt every plaintext secret across all .env files in one grouped undo step. Snapshots are
    // taken before/after each affected file so a single Ctrl+Z reverts the whole batch.
    private async encryptAllSecretsWorkspace(folder: vscode.WorkspaceFolder, activeFileId: string, history: EditHistory): Promise<void> {
        const landscape = await this.landscape.build(folder, activeFileId);
        const affected = Object.values(landscape.files)
            .filter((view) => view.rows.some((row) => row.status === "secret-plaintext"))
            .map((view) => toUri(folder, view.fileId));
        const before = await Promise.all(affected.map((uri) => currentText(uri)));

        const { count } = await encryptAllSecrets(folder, landscape);

        const snapshots: Snapshot[] = [];
        for (let i = 0; i < affected.length; i++) {
            const after = await currentText(affected[i]!);
            if (after !== before[i]) {
                snapshots.push({ uri: affected[i]!, before: before[i]!, after });
            }
        }
        history.recordBatch(snapshots);
        void vscode.window.showInformationMessage(`Encrypted ${count} secret${count === 1 ? "" : "s"}.`);
    }
}

async function currentText(uri: vscode.Uri): Promise<string> {
    const document = await vscode.workspace.openTextDocument(uri);
    return document.getText();
}

// Snapshot a file's text around a single mutating action so one webview message = one undo step,
// even when the action writes several entries (e.g. "Add all missing").
async function withHistory(history: EditHistory, uri: vscode.Uri, run: (uri: vscode.Uri) => Promise<unknown>): Promise<void> {
    const before = await currentText(uri);
    await run(uri);
    const after = await currentText(uri);
    if (after !== before) {
        history.record({ uri, before, after });
    }
}
