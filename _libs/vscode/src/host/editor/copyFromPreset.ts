import { baseName, dirOf, listEntries, parseEnv } from "@puristic/env/index.js";
import * as vscode from "vscode";
import { scanWorkspace } from "../discovery/scan.js";
import { setEnvValues } from "./documentWrites.js";
import { buildPresetCopyPlan, presetDiffDetail } from "./presetCopyPlan.js";
import { readText, toUri } from "./uris.js";

export async function copyFromPreset(folder: vscode.WorkspaceFolder, fileId: string): Promise<void> {
    const dir = dirOf(fileId);
    const scan = await scanWorkspace(folder);
    const presetIds = scan.envFileIds.filter((id) => id !== fileId && dirOf(id) === dir);
    if (presetIds.length === 0) {
        await vscode.window.showInformationMessage("No sibling preset files in this directory.");
        return;
    }

    const presetItems = await Promise.all(
        presetIds.map(async (id) => {
            const { text } = await readText(toUri(folder, id));
            const count = listEntries(parseEnv(text)).length;
            return { label: baseName(id), description: `${count} ${count === 1 ? "key" : "keys"}`, id };
        }),
    );
    const chosen = await vscode.window.showQuickPick(presetItems, { placeHolder: `Copy keys into ${baseName(fileId)} from…` });
    if (chosen === undefined) {
        return;
    }

    const targetEntries = listEntries(parseEnv((await readText(toUri(folder, fileId))).text));
    const presetEntries = listEntries(parseEnv((await readText(toUri(folder, chosen.id))).text));
    const plan = buildPresetCopyPlan(targetEntries, presetEntries);

    const keyItems = plan.map((entry) => ({
        label: entry.key,
        description: entry.change,
        detail: presetDiffDetail(entry),
        picked: entry.change === "add" || entry.change === "override",
        plan: entry,
    }));
    const selection = await vscode.window.showQuickPick(keyItems, {
        canPickMany: true,
        placeHolder: `Select keys to merge from ${chosen.label}`,
    });
    if (selection === undefined || selection.length === 0) {
        return;
    }

    const entries = selection.map((item) => ({ key: item.plan.key, value: item.plan.value }));
    await setEnvValues(toUri(folder, fileId), entries);
    await vscode.window.showInformationMessage(`Merged ${entries.length} ${entries.length === 1 ? "key" : "keys"} from ${chosen.label}.`);
}
