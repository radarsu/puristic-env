// Expand ${VAR} and $VAR references inside env values, the way `envsubst` / dotenv-expand do, so a
// stored value like `postgres://${DB_HOST}/app` resolves at `run` time. Each reference resolves
// against the record's own keys first (siblings), then an ambient lookup (the process environment).
// `\$` is an escape for a literal `$`; an unresolved reference becomes an empty string.

const REFERENCE = /\\\$|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

export function expandValue(value: string, lookup: (name: string) => string | undefined): string {
    return value.replace(REFERENCE, (match, braced: string | undefined, bare: string | undefined) => {
        if (match === "\\$") {
            return "$";
        }
        return lookup((braced ?? bare) as string) ?? "";
    });
}

export function expandEnv(record: Record<string, string>, ambient?: (name: string) => string | undefined): Record<string, string> {
    const resolved: Record<string, string> = {};
    const resolving = new Set<string>();

    const resolve = (name: string): string | undefined => {
        if (name in resolved) {
            return resolved[name];
        }
        if (!(name in record)) {
            return ambient?.(name);
        }
        if (resolving.has(name)) {
            return ""; // reference cycle — stop rather than loop forever
        }
        resolving.add(name);
        const expanded = expandValue(record[name] as string, resolve);
        resolving.delete(name);
        resolved[name] = expanded;
        return expanded;
    };

    for (const name of Object.keys(record)) {
        resolve(name);
    }
    return resolved;
}
