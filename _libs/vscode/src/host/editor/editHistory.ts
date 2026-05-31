import type * as vscode from "vscode";

export interface Snapshot {
    uri: vscode.Uri;
    before: string;
    after: string;
}

// One undo entry covers a set of files so multi-file actions (e.g. workspace encrypt) revert in a single step.
type Step = Snapshot[];

// A per-session undo/redo stack for webview-driven edits. VSCode's native `undo` command is a
// no-op while the webview holds focus (microsoft/vscode#175297), so the webview forwards Ctrl+Z
// here and we revert by re-writing the document text — itself a WorkspaceEdit, so dirty/save stay
// native. `read`/`write` are injected (the document's current text and documentWrites.writeText).
export class EditHistory {
    private readonly undoStack: Step[] = [];
    private readonly redoStack: Step[] = [];

    constructor(
        private readonly read: (uri: vscode.Uri) => Promise<string>,
        private readonly write: (uri: vscode.Uri, text: string) => Promise<void>,
    ) {}

    record(snapshot: Snapshot): void {
        this.recordBatch([snapshot]);
    }

    recordBatch(snapshots: Snapshot[]): void {
        if (snapshots.length === 0) {
            return;
        }
        this.undoStack.push(snapshots);
        this.redoStack.length = 0;
    }

    async undo(): Promise<void> {
        const step = this.undoStack.pop();
        if (step === undefined) {
            return;
        }
        // A file moved out from under us (external edit) — our stacks are stale, drop them.
        if (!(await this.allMatch(step, "after"))) {
            this.reset();
            return;
        }
        for (const snapshot of step) {
            await this.write(snapshot.uri, snapshot.before);
        }
        this.redoStack.push(step);
    }

    async redo(): Promise<void> {
        const step = this.redoStack.pop();
        if (step === undefined) {
            return;
        }
        if (!(await this.allMatch(step, "before"))) {
            this.reset();
            return;
        }
        for (const snapshot of step) {
            await this.write(snapshot.uri, snapshot.after);
        }
        this.undoStack.push(step);
    }

    private async allMatch(step: Step, side: "before" | "after"): Promise<boolean> {
        for (const snapshot of step) {
            if ((await this.read(snapshot.uri)) !== snapshot[side]) {
                return false;
            }
        }
        return true;
    }

    private reset(): void {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
    }
}
