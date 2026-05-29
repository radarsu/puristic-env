import type { LeafDescriptorPublic } from "./inspectSchema.js";

// The per-variable status vocabulary shared by the CLI (`puristic validate`) and the VSCode
// editor — one source of truth so both classify a value identically.
export type VarStatus = "ok" | "missing-required" | "using-default" | "invalid" | "unknown" | "secret-encrypted" | "secret-plaintext" | "no-schema";

export interface ClassifyInput {
    descriptor: LeafDescriptorPublic | undefined;
    present: boolean;
    isEncrypted: boolean;
    validationOk: boolean | undefined;
    validationMessage: string | undefined;
}

export interface Classification {
    status: VarStatus;
    message?: string;
}

export function classify(input: ClassifyInput): Classification {
    const descriptor = input.descriptor;
    if (descriptor === undefined) {
        return { status: "unknown", message: "Not defined in the schema" };
    }

    if (descriptor.secret) {
        if (!input.present) {
            return missing(descriptor, "Required secret is missing");
        }
        if (input.isEncrypted) {
            return { status: "secret-encrypted" };
        }
        return { status: "secret-plaintext", message: "Secret stored as plaintext — encrypt it" };
    }

    if (!input.present) {
        return missing(descriptor, "Required value is missing");
    }

    if (input.validationOk === false) {
        return { status: "invalid", message: invalidMessage(descriptor, input.validationMessage) };
    }
    return { status: "ok" };
}

function missing(descriptor: LeafDescriptorPublic, requiredMessage: string): Classification {
    if (descriptor.required) {
        return { status: "missing-required", message: requiredMessage };
    }
    return { status: "using-default", message: defaultHint(descriptor) };
}

function defaultHint(descriptor: LeafDescriptorPublic): string {
    if (!descriptor.hasDefault) {
        return "Optional — not set";
    }
    return descriptor.default !== undefined ? `Using default: ${String(descriptor.default)}` : "Using schema default";
}

function invalidMessage(descriptor: LeafDescriptorPublic, message: string | undefined): string {
    const base = message ?? "Invalid value";
    if ((descriptor.type === "number" || descriptor.type === "boolean") && !descriptor.coerce) {
        return `${base} — schema isn't coercion-enabled; use z.coerce.${descriptor.type}()`;
    }
    return base;
}
