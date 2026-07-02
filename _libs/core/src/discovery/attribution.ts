import type { LeafDescriptorPublic } from "../inspectSchema.js";
import type { LeafValidation, ValidationReport } from "../validateValues.js";

export interface AppSchema {
    configId: string;
    app: string;
    descriptors: LeafDescriptorPublic[];
}

export interface VarConflict {
    envName: string;
    apps: string[];
}

export interface Attribution {
    descriptors: LeafDescriptorPublic[];
    appsByEnv: Map<string, string[]>;
    conflicts: VarConflict[];
}

// Combine the schemas that a single .env supplies. Descriptors are unioned by envName (the first
// declaring app wins the shape), appsByEnv records every app that declares each variable — so a var
// owned by >= 2 apps is "shared" — and conflicts flags a variable declared by multiple apps with an
// incompatible definition (differing type/required/coerce/enum/constraints).
export function attributeConfigs(schemas: AppSchema[]): Attribution {
    const descriptors: LeafDescriptorPublic[] = [];
    const seen = new Set<string>();
    const appsByEnv = new Map<string, string[]>();
    const signatures = new Map<string, Set<string>>();

    for (const { app, descriptors: leaves } of schemas) {
        for (const descriptor of leaves) {
            const apps = appsByEnv.get(descriptor.envName);
            if (apps === undefined) {
                appsByEnv.set(descriptor.envName, [app]);
            } else if (!apps.includes(app)) {
                apps.push(app);
            }

            const shapes = signatures.get(descriptor.envName);
            if (shapes === undefined) {
                signatures.set(descriptor.envName, new Set([signatureOf(descriptor)]));
            } else {
                shapes.add(signatureOf(descriptor));
            }

            if (!seen.has(descriptor.envName)) {
                seen.add(descriptor.envName);
                descriptors.push(descriptor);
            }
        }
    }

    const conflicts: VarConflict[] = [];
    for (const [envName, apps] of appsByEnv) {
        if (apps.length >= 2 && (signatures.get(envName)?.size ?? 0) >= 2) {
            conflicts.push({ envName, apps });
        }
    }
    return { descriptors, appsByEnv, conflicts };
}

function signatureOf(descriptor: LeafDescriptorPublic): string {
    return JSON.stringify([descriptor.type, descriptor.required, descriptor.coerce, descriptor.enumValues, descriptor.constraints]);
}

// Validate one .env against several schemas by merging their per-config reports. A shared variable
// must satisfy every owning schema, so the first failure (missing-required or invalid) wins over an
// ok. Distinct form-level errors are concatenated.
export function mergeValidationReports(reports: ValidationReport[]): ValidationReport {
    const byEnv = new Map<string, LeafValidation>();
    const order: string[] = [];
    for (const report of reports) {
        for (const leaf of report.leaves) {
            const existing = byEnv.get(leaf.envName);
            if (existing === undefined) {
                byEnv.set(leaf.envName, leaf);
                order.push(leaf.envName);
                continue;
            }
            if (existing.ok && !leaf.ok) {
                byEnv.set(leaf.envName, leaf);
            }
        }
    }
    const leaves = order.map((envName) => byEnv.get(envName)!);
    const formErrors = [...new Set(reports.map((report) => report.formError).filter((error): error is string => error !== undefined))];
    return formErrors.length > 0 ? { leaves, formError: formErrors.join("; ") } : { leaves };
}
