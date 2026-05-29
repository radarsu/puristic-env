import { isEnvelope } from "@puristic/env/index.js";

export type PresetChange = "add" | "override" | "unchanged";

export interface PresetKeyPlan {
    key: string;
    value: string;
    change: PresetChange;
    previous?: string;
}

// Diff the preset's entries against the target's. Order follows the preset so the checklist reads
// top-to-bottom the same way the source file does.
export function buildPresetCopyPlan(
    target: { key: string; value: string }[],
    preset: { key: string; value: string }[],
): PresetKeyPlan[] {
    const current = new Map(target.map((entry) => [entry.key, entry.value]));
    return preset.map((entry) => {
        const previous = current.get(entry.key);
        if (previous === undefined) {
            return { key: entry.key, value: entry.value, change: "add" };
        }
        if (previous === entry.value) {
            return { key: entry.key, value: entry.value, change: "unchanged", previous };
        }
        return { key: entry.key, value: entry.value, change: "override", previous };
    });
}

function mask(value: string): string {
    return isEnvelope(value) ? "encrypted" : value;
}

// The QuickPick detail line: the masked new value for adds, or `old → new` for overrides/unchanged.
export function presetDiffDetail(plan: PresetKeyPlan): string {
    if (plan.change === "add") {
        return mask(plan.value);
    }
    return `${mask(plan.previous ?? "")} → ${mask(plan.value)}`;
}
