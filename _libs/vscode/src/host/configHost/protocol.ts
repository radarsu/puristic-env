import type { LeafDescriptorPublic, ValidationReport } from "@puristic/env/index.js";

export type ConfigHostRequest =
    | { id: number; op: "ping" }
    | { id: number; op: "introspect" }
    | { id: number; op: "validate"; values: Record<string, string> };

export interface ConfigHostError {
    kind: string;
    message: string;
    stack?: string;
}

export type ConfigHostResponse =
    | { id: number; ok: true; op: "ping" }
    | { id: number; ok: true; op: "introspect"; descriptors: LeafDescriptorPublic[] }
    | { id: number; ok: true; op: "validate"; report: ValidationReport }
    | { id: number; ok: false; op: string; error: ConfigHostError };
