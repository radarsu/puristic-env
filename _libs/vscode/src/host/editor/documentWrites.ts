import { addKey, type EnvDocument, parseEnv, removeKey, serializeEnv, setValue } from "@puristic/env/index.js";
import * as vscode from "vscode";

type Mutation = (doc: EnvDocument) => EnvDocument;

// Every write — including to the custom editor's own document — goes through openTextDocument +
// WorkspaceEdit so dirty/undo/save semantics are native and identical across all files. Nothing
// is written to disk until the user saves.
export async function writeText(uri: vscode.Uri, text: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const current = document.getText();
    if (text === current) {
        return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(current.length)), text);
    await vscode.workspace.applyEdit(edit);
}

async function applyMutation(uri: vscode.Uri, mutate: Mutation): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    await writeText(uri, serializeEnv(mutate(parseEnv(document.getText()))));
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

// Throw away unsaved edits by writing the on-disk (saved) content back into the buffer — which clears dirty
// since the buffer then matches the saved version. Goes through writeText (WorkspaceEdit) so it's undoable.
export async function revertToSaved(uri: vscode.Uri): Promise<void> {
    const onDisk = await vscode.workspace.fs.readFile(uri);
    await writeText(uri, new TextDecoder().decode(onDisk));
}
