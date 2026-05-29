import { addKey, type EnvDocument, parseEnv, removeKey, serializeEnv, setValue } from "@confederation/core/index.js";
import * as vscode from "vscode";

type Mutation = (doc: EnvDocument) => EnvDocument;

// Every write — including to the custom editor's own document — goes through openTextDocument +
// WorkspaceEdit so dirty/undo/save semantics are native and identical across all files. Nothing
// is written to disk until the user saves.
async function applyMutation(uri: vscode.Uri, mutate: Mutation): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const current = document.getText();
    const next = serializeEnv(mutate(parseEnv(current)));
    if (next === current) {
        return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(current.length)), next);
    await vscode.workspace.applyEdit(edit);
}

export function setEnvValue(uri: vscode.Uri, key: string, value: string): Promise<void> {
    return applyMutation(uri, (doc) => setValue(doc, key, value));
}

export function setEnvValues(uri: vscode.Uri, entries: { key: string; value: string }[]): Promise<void> {
    return applyMutation(uri, (doc) => entries.reduce((acc, entry) => setValue(acc, entry.key, entry.value), doc));
}

export function addEnvKey(uri: vscode.Uri, key: string, value: string): Promise<void> {
    return applyMutation(uri, (doc) => addKey(doc, key, value));
}

export function removeEnvKey(uri: vscode.Uri, key: string): Promise<void> {
    return applyMutation(uri, (doc) => removeKey(doc, key));
}

export async function saveDocument(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.isDirty) {
        await document.save();
    }
}
