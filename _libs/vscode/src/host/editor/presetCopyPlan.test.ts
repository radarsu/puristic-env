import { describe, expect, it } from "vitest";
import { buildPresetCopyPlan } from "./presetCopyPlan.js";

describe("buildPresetCopyPlan", () => {
    it("marks keys absent from the target as add", () => {
        const plan = buildPresetCopyPlan([], [{ key: "A", value: "1" }]);
        expect(plan).toEqual([{ key: "A", value: "1", change: "add" }]);
    });

    it("marks differing values as override and captures the previous value", () => {
        const plan = buildPresetCopyPlan([{ key: "A", value: "old" }], [{ key: "A", value: "new" }]);
        expect(plan).toEqual([{ key: "A", value: "new", change: "override", previous: "old" }]);
    });

    it("marks equal values as unchanged", () => {
        const plan = buildPresetCopyPlan([{ key: "A", value: "same" }], [{ key: "A", value: "same" }]);
        expect(plan).toEqual([{ key: "A", value: "same", change: "unchanged", previous: "same" }]);
    });

    it("follows the preset's key order and ignores target-only keys", () => {
        const plan = buildPresetCopyPlan(
            [{ key: "LOCAL_ONLY", value: "keep" }, { key: "B", value: "old" }],
            [{ key: "B", value: "new" }, { key: "A", value: "1" }],
        );
        expect(plan.map((entry) => entry.key)).toEqual(["B", "A"]);
        expect(plan.map((entry) => entry.change)).toEqual(["override", "add"]);
    });
});
