import { dirname } from "node:path";
import { getValue, isEnvelope, parseEnv } from "@puristic/env/index.js";
import * as vscode from "vscode";
import type { HostToWebview, WebviewToHost } from "../../shared/protocol.js";
import type { ConfigHostManager } from "../configHost/manager.js";
import { decryptValue, encryptForProject } from "../secrets.js";
import { copyFromPreset } from "./copyFromPreset.js";
import { addEnvKey, removeEnvKey, saveDocument, setEnvValue } from "./documentWrites.js";
import { encryptAllSecrets } from "./encryptAllSecrets.js";
import { LandscapeService } from "./landscapeService.js";
import { isEnvUri, readText, relativeId, toUri } from "./uris.js";
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
        const onFsEvent = (uri: vscode.Uri): void => {
            if (uri.path.includes("env.config.")) {
                this.manager.restart(uri.fsPath);
            }
            refresh();
        };
        disposables.push(watcher, watcher.onDidChange(onFsEvent), watcher.onDidCreate(onFsEvent), watcher.onDidDelete(onFsEvent));

        disposables.push(
            webviewPanel.webview.onDidReceiveMessage((message: WebviewToHost) => {
                void this.handleMessage(folder, activeFileId, message, post);
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
                    await setEnvValue(toUri(folder, message.fileId), message.envName, message.value);
                    return;
                case "addKey":
                    await addEnvKey(toUri(folder, message.fileId), message.envName, message.value);
                    return;
                case "removeKey":
                    await removeEnvKey(toUri(folder, message.fileId), message.envName);
                    return;
                case "resetToDefault":
                    // Removing the override lets puristic apply the schema default at load time.
                    await removeEnvKey(toUri(folder, message.fileId), message.envName);
                    return;
                case "addAllMissing":
                    await this.addAllMissing(folder, activeFileId, message.fileId);
                    return;
                case "copyFromPreset":
                    await copyFromPreset(folder, message.fileId);
                    return;
                case "encryptAllSecrets":
                    await encryptAllSecrets(this.landscape, folder, message.fileId);
                    return;
                case "encryptSecret": {
                    const uri = toUri(folder, message.fileId);
                    const cipher = encryptForProject(message.plaintext, dirname(uri.fsPath));
                    await setEnvValue(uri, message.envName, cipher);
                    return;
                }
                case "revealSecret":
                    await this.revealSecret(folder, message.requestId, message.fileId, message.envName, post);
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

    private async revealSecret(
        folder: vscode.WorkspaceFolder,
        requestId: string,
        fileId: string,
        envName: string,
        post: (message: HostToWebview) => void,
    ): Promise<void> {
        const { text } = await readText(toUri(folder, fileId));
        const raw = getValue(parseEnv(text), envName);
        if (raw === undefined) {
            post({ type: "revealSecretResult", requestId, fileId, envName, ok: false, message: "No value set" });
            return;
        }
        if (!isEnvelope(raw)) {
            post({ type: "revealSecretResult", requestId, fileId, envName, ok: true, value: raw });
            return;
        }
        try {
            post({ type: "revealSecretResult", requestId, fileId, envName, ok: true, value: decryptValue(raw) });
        } catch (cause) {
            post({ type: "revealSecretResult", requestId, fileId, envName, ok: false, message: (cause as Error).message });
        }
    }
}
