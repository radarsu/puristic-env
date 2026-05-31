import { dirname } from "node:path";
import type * as vscode from "vscode";
import type { Landscape } from "../../shared/protocol.js";
import { encryptForProject } from "../secrets.js";
import { setEnvValue } from "./documentWrites.js";
import { toUri } from "./uris.js";

// Encrypt every plaintext secret across all files in the landscape in place. Shared by the webview
// "Encrypt all plaintext secrets" action and the puristic.encryptAllSecrets command. Each file is
// encrypted with its own project public key (files may live in different projects). Returns the total
// encrypted and the ids of the files that changed (so the caller can group them into one undo step).
export async function encryptAllSecrets(folder: vscode.WorkspaceFolder, landscape: Landscape): Promise<{ count: number; fileIds: string[] }> {
    let count = 0;
    const fileIds: string[] = [];
    for (const view of Object.values(landscape.files)) {
        const uri = toUri(folder, view.fileId);
        const projectDir = dirname(uri.fsPath);
        let changed = false;
        for (const row of view.rows) {
            if (row.status !== "secret-plaintext" || row.rawValue === undefined || row.rawValue === "") {
                continue;
            }
            await setEnvValue(uri, row.envName, encryptForProject(row.rawValue, projectDir));
            count++;
            changed = true;
        }
        if (changed) {
            fileIds.push(view.fileId);
        }
    }
    return { count, fileIds };
}
