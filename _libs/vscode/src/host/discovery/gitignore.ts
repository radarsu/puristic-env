import { execFile } from "node:child_process";
import { dirname } from "node:path";
import type * as vscode from "vscode";

// Returns the subset of `uris` that are NOT inside a gitignored directory.
// A file is dropped only when one of its ancestor directories is ignored — never
// because the file itself matches an ignore rule, so a gitignored `.env.local`
// sitting in a visible directory is kept (managing those is the point).
export async function filterGitignored(folder: vscode.WorkspaceFolder, uris: vscode.Uri[]): Promise<vscode.Uri[]> {
    if (uris.length === 0) {
        return uris;
    }

    const root = folder.uri.fsPath;
    const candidates = new Set<string>();
    for (const uri of uris) {
        for (const dir of ancestorDirs(root, uri.fsPath)) {
            candidates.add(dir);
        }
    }

    const ignored = await checkIgnore(root, [...candidates]);
    if (ignored.size === 0) {
        return uris;
    }

    return uris.filter((uri) => !ancestorDirs(root, uri.fsPath).some((dir) => ignored.has(dir)));
}

// Ancestor directories of `path` from its immediate parent up to (excluding) `root`.
function ancestorDirs(root: string, path: string): string[] {
    const dirs: string[] = [];
    let dir = dirname(path);
    while (dir.startsWith(root) && dir !== root) {
        dirs.push(dir);
        const parent = dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return dirs;
}

// Ask git which of `paths` are ignored. git echoes the matching paths verbatim
// (absolute in → absolute out), NUL-separated thanks to `-z`. Exit 1 (none ignored)
// and 128 (not a git repo / git unavailable) both yield empty stdout, so a non-git
// workspace simply filters nothing.
function checkIgnore(cwd: string, paths: string[]): Promise<Set<string>> {
    return new Promise((resolve) => {
        const child = execFile("git", ["check-ignore", "--stdin", "-z"], { cwd }, (_error, stdout) => {
            resolve(new Set(stdout.split("\0").filter((path) => path.length > 0)));
        });
        child.stdin?.end(paths.join("\0"));
    });
}
