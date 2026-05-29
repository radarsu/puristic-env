import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

export function renderWebviewHtml(webview: vscode.Webview, distRoot: vscode.Uri): string {
    const nonce = randomBytes(16).toString("base64");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, "webview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, "webview.css"));
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} data:`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `script-src 'nonce-${nonce}'`,
        `font-src ${webview.cspSource}`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Puristic Env Manager</title>
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
