// Operate on "/"-separated relative paths (e.g. workspace-relative POSIX paths as produced by
// vscode.workspace.asRelativePath).

export function dirOf(fileId: string): string {
    const idx = fileId.lastIndexOf("/");
    return idx === -1 ? "" : fileId.slice(0, idx);
}

export function baseName(fileId: string): string {
    const idx = fileId.lastIndexOf("/");
    return idx === -1 ? fileId : fileId.slice(idx + 1);
}

export function isAncestorOrSame(ancestorDir: string, dir: string): boolean {
    if (ancestorDir === "") {
        return true;
    }
    return dir === ancestorDir || dir.startsWith(`${ancestorDir}/`);
}

// The longest package root that contains dir — the package a config or .env file belongs to.
export function packageRootOf(dir: string, packageRootDirs: string[]): string | undefined {
    let best: string | undefined;
    for (const root of packageRootDirs) {
        if (!isAncestorOrSame(root, dir)) {
            continue;
        }
        if (best === undefined || root.length > best.length) {
            best = root;
        }
    }
    return best;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".mts", ".cts"]);
const BUILD_SEGMENTS = new Set(["dist", "build"]);

function extensionOf(fileId: string): string {
    const idx = fileId.lastIndexOf(".");
    return idx === -1 ? "" : fileId.slice(idx);
}

function isBuilt(fileId: string): boolean {
    return dirOf(fileId)
        .split("/")
        .some((segment) => BUILD_SEGMENTS.has(segment));
}

// Pick the better of two config ids for the same package: prefer TypeScript source over compiled
// output, then a path outside a dist/build dir, then the shallower path, then lexical order.
export function preferConfig(a: string, b: string): string {
    const aSource = SOURCE_EXTENSIONS.has(extensionOf(a));
    const bSource = SOURCE_EXTENSIONS.has(extensionOf(b));
    if (aSource !== bSource) {
        return aSource ? a : b;
    }
    const aBuilt = isBuilt(a);
    const bBuilt = isBuilt(b);
    if (aBuilt !== bBuilt) {
        return aBuilt ? b : a;
    }
    const aDepth = a.split("/").length;
    const bDepth = b.split("/").length;
    if (aDepth !== bDepth) {
        return aDepth < bDepth ? a : b;
    }
    return a <= b ? a : b;
}
