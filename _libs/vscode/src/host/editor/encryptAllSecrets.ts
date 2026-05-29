import { dirname } from "node:path";
import { getValue, parseEnv } from "@puristic/env/index.js";
import type * as vscode from "vscode";
import { encryptForProject } from "../secrets.js";
import { setEnvValue } from "./documentWrites.js";
import type { LandscapeService } from "./landscapeService.js";
import { readText, toUri } from "./uris.js";

// Encrypt every plaintext secret in a .env file in place. Shared by the webview "Encrypt all
// secrets" action and the puristic.encryptAllSecrets command. Returns how many were encrypted.
export async function encryptAllSecrets(landscape: LandscapeService, folder: vscode.WorkspaceFolder, fileId: string): Promise<number> {
    const built = await landscape.build(folder, fileId);
    const view = built.files[fileId];
    if (view === undefined) {
        return 0;
    }
    const uri = toUri(folder, fileId);
    const { text } = await readText(uri);
    const doc = parseEnv(text);
    let count = 0;
    for (const row of view.rows) {
        if (row.status !== "secret-plaintext") {
            continue;
        }
        const value = getValue(doc, row.envName);
        if (value === undefined || value === "") {
            continue;
        }
        await setEnvValue(uri, row.envName, encryptForProject(value, dirname(uri.fsPath)));
        count++;
    }
    return count;
}
