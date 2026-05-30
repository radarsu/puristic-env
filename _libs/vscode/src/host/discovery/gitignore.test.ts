import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type * as vscode from "vscode";
import { filterGitignored } from "./gitignore.js";

let root: string | undefined;

// A vscode.Uri/WorkspaceFolder is only ever read for `.fsPath` here, so plain stand-ins suffice.
const folderAt = (fsPath: string): vscode.WorkspaceFolder => ({ uri: { fsPath } }) as vscode.WorkspaceFolder;
const uriAt = (fsPath: string): vscode.Uri => ({ fsPath }) as vscode.Uri;

afterEach(() => {
    if (root !== undefined) {
        rmSync(root, { recursive: true, force: true });
        root = undefined;
    }
});

describe("filterGitignored", () => {
    it("drops files inside a gitignored directory but keeps a gitignored file in a visible directory", () => {
        root = mkdtempSync(join(tmpdir(), "purenv-gi-"));
        execFileSync("git", ["init", "-q"], { cwd: root });
        writeFileSync(join(root, ".gitignore"), "ignored-dir/\n.env.local\n");
        writeFileSync(join(root, ".env.local"), "");
        mkdirSync(join(root, "ignored-dir"));
        writeFileSync(join(root, "ignored-dir", ".env.local"), "");

        const visible = uriAt(join(root, ".env.local"));
        const buried = uriAt(join(root, "ignored-dir", ".env.local"));

        return expect(filterGitignored(folderAt(root), [visible, buried])).resolves.toEqual([visible]);
    });

    it("returns all uris unchanged outside a git repo", () => {
        root = mkdtempSync(join(tmpdir(), "purenv-gi-"));
        const uris = [uriAt(join(root, ".env.local")), uriAt(join(root, "dist", ".env.local"))];

        return expect(filterGitignored(folderAt(root), uris)).resolves.toEqual(uris);
    });
});
