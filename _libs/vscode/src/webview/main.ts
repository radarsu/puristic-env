import "./styles.css";
import { fromInputValue } from "../shared/formats.js";
import type { HostToWebview } from "../shared/protocol.js";
import { send, vscode } from "./api.js";
import { clear, h } from "./dom.js";
import { icon } from "./icons.js";
import { renderBanner } from "./render/banner.js";
import { renderGrid } from "./render/grid.js";
import { renderMatrix } from "./render/matrix.js";
import { highlightInto, renderRaw } from "./render/raw.js";
import { renderSidebar } from "./render/sidebar.js";
import { type AppState, type PersistedState, type ViewMode } from "./state.js";

const app = document.getElementById("app");
const persisted = vscode.getState<PersistedState>();

const state: AppState = {
    landscape: undefined,
    selectedFileId: persisted?.selectedFileId,
    mode: persisted?.mode ?? "grid",
    filter: persisted?.filter ?? "",
    revealSecrets: persisted?.revealSecrets ?? true,
    error: undefined,
};

let editingValue: string | undefined;
// Pending debounced commit (text inputs / raw textarea commit ~300ms after typing stops, not just on blur).
let commitTimer: ReturnType<typeof setTimeout> | undefined;

if (app !== null) {
    window.addEventListener("message", (event: MessageEvent<HostToWebview>) => onMessage(event.data));
    window.addEventListener("keydown", onKeydown);
    app.addEventListener("focusin", onFocusIn);
    app.addEventListener("click", onClick);
    app.addEventListener("change", onChange);
    app.addEventListener("input", onInput);
    // Scroll doesn't bubble — capture it to keep the raw highlight overlay aligned with the textarea.
    app.addEventListener("scroll", onScroll, true);
    send({ type: "ready" });
}

function persist(): void {
    vscode.setState<PersistedState>({
        selectedFileId: state.selectedFileId,
        mode: state.mode,
        filter: state.filter,
        revealSecrets: state.revealSecrets,
    });
}

function onMessage(message: HostToWebview): void {
    switch (message.type) {
        case "hydrate":
        case "landscapeUpdated":
            state.landscape = message.landscape;
            state.error = undefined;
            if (state.selectedFileId === undefined || state.landscape.files[state.selectedFileId] === undefined) {
                state.selectedFileId = state.landscape.activeFileId;
            }
            render();
            return;
        case "fileDirtyChanged": {
            const file = state.landscape?.files[message.fileId];
            if (file !== undefined) {
                file.dirty = message.dirty;
                render();
            }
            return;
        }
        case "actionError":
            state.error = message.message;
            render();
            return;
    }
}

function onClick(event: MouseEvent): void {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-action]") : null;
    if (target === null) {
        return;
    }
    const action = target.dataset["action"];
    const file = target.dataset["file"];
    const env = target.dataset["env"];
    switch (action) {
        case "select-file":
            if (file !== undefined) {
                state.selectedFileId = file;
                state.mode = "grid";
                persist();
                render();
            }
            return;
        case "tab":
            state.mode = (target.dataset["mode"] as ViewMode | undefined) ?? "grid";
            persist();
            render();
            return;
        case "add-key":
            if (file !== undefined && env !== undefined) {
                send({ type: "addKey", fileId: file, envName: env, value: target.dataset["default"] ?? "" });
            }
            return;
        case "remove":
            if (file !== undefined && env !== undefined) {
                send({ type: "removeKey", fileId: file, envName: env });
            }
            return;
        case "reset":
            if (file !== undefined && env !== undefined) {
                send({ type: "resetToDefault", fileId: file, envName: env });
            }
            return;
        case "encrypt-existing":
            if (file !== undefined && env !== undefined) {
                send({ type: "encryptSecret", fileId: file, envName: env, plaintext: target.dataset["plaintext"] ?? "" });
            }
            return;
        case "toggle-reveal":
            state.revealSecrets = !state.revealSecrets;
            persist();
            render();
            return;
        case "add-all":
            if (file !== undefined) {
                send({ type: "addAllMissing", fileId: file });
            }
            return;
        case "encrypt-all-workspace":
            send({ type: "encryptAllSecretsWorkspace" });
            return;
        case "copy-preset":
            if (file !== undefined) {
                send({ type: "copyFromPreset", fileId: file });
            }
            return;
        case "save":
            if (file !== undefined) {
                send({ type: "saveFile", fileId: file });
            }
            return;
        case "discard":
            if (file !== undefined) {
                send({ type: "discardChanges", fileId: file });
            }
            return;
        case "save-all":
            send({ type: "saveAll" });
            return;
        case "open-text":
            if (file !== undefined) {
                send({ type: "openAsPlainText", fileId: file });
            }
            return;
        case "cell":
            if (file !== undefined) {
                state.selectedFileId = file;
                state.mode = "grid";
                persist();
                render();
            }
            return;
    }
}

type EditTarget = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// Write a field's current value through the host. Shared by the debounce (typing pause) and onChange (blur).
function commitField(target: EditTarget): void {
    const action = target.dataset["action"];
    const file = target.dataset["file"];
    if (action === "set-file-text" && file !== undefined) {
        send({ type: "setFileText", fileId: file, text: target.value });
        return;
    }
    const env = target.dataset["env"];
    if (file === undefined || env === undefined) {
        return;
    }
    if (action === "set") {
        const format = target.dataset["format"];
        const value = format !== undefined ? fromInputValue(format, target.value) : target.value;
        send({ type: "setValue", fileId: file, envName: env, value });
    } else if (action === "encrypt-set" && target.value !== "") {
        send({ type: "encryptSecret", fileId: file, envName: env, plaintext: target.value });
    }
}

function scheduleCommit(target: EditTarget): void {
    flushCommit();
    commitTimer = setTimeout(() => {
        commitTimer = undefined;
        commitField(target);
    }, 300);
}

function flushCommit(): void {
    if (commitTimer !== undefined) {
        clearTimeout(commitTimer);
        commitTimer = undefined;
    }
}

function onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement) && !(target instanceof HTMLTextAreaElement)) {
        return;
    }
    // Blur is the flush point: cancel any pending debounce and commit now.
    flushCommit();
    commitField(target);
}

function onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset["action"] === "filter") {
        state.filter = target.value;
        persist();
        render();
        return;
    }
    if (target instanceof HTMLTextAreaElement && target.dataset["action"] === "set-file-text") {
        syncRawHighlight(target);
        scheduleCommit(target);
        return;
    }
    // Plaintext value inputs commit on a short pause so undo/status/buttons react without blurring. Secret
    // (encrypt-set) inputs stay blur-only — debouncing would encrypt half-typed values.
    if (target instanceof HTMLInputElement && target.dataset["action"] === "set") {
        scheduleCommit(target);
    }
}

function onScroll(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.dataset["action"] === "set-file-text") {
        rawHighlightPre(target)?.scrollTo(target.scrollLeft, target.scrollTop);
    }
}

function rawHighlightPre(textarea: HTMLTextAreaElement): HTMLElement | undefined {
    const pre = textarea.parentElement?.querySelector(".raw-highlight");
    return pre instanceof HTMLElement ? pre : undefined;
}

// Re-tokenize and re-align the overlay with the textarea's content and scroll position.
function syncRawHighlight(textarea: HTMLTextAreaElement): void {
    const pre = rawHighlightPre(textarea);
    if (pre !== undefined) {
        highlightInto(pre, textarea.value);
        pre.scrollTo(textarea.scrollLeft, textarea.scrollTop);
    }
}

// Remember a value field's committed text on focus so Escape can restore it (see onKeydown).
function onFocusIn(event: FocusEvent): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset["action"] === "set") {
        editingValue = target.value;
    }
}

function onKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (event.key === "Escape" && target instanceof HTMLInputElement && target.dataset["action"] === "set" && editingValue !== undefined) {
        // Restore the committed value and blur: the value now matches focus time, so no change fires.
        target.value = editingValue;
        target.blur();
        event.preventDefault();
        return;
    }
    if (!(event.ctrlKey || event.metaKey)) {
        return;
    }
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        send({ type: "undo" });
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        send({ type: "redo" });
    } else if (key === "s") {
        event.preventDefault();
        if (event.shiftKey || state.selectedFileId === undefined) {
            send({ type: "saveAll" });
        } else {
            send({ type: "saveFile", fileId: state.selectedFileId });
        }
    } else if (key === "f") {
        event.preventDefault();
        focusFilter();
    }
}

function focusFilter(): void {
    if (app === null) {
        return;
    }
    const input = app.querySelector<HTMLInputElement>('[data-action="filter"]');
    if (input !== null) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

// render() does a full clear+rebuild, so a focused field would lose focus/caret on every refresh (including
// debounced commits). Snapshot the active editable control and restore it afterwards.
interface FocusSnapshot {
    selector: string;
    value: string;
    selStart: number | null;
    selEnd: number | null;
    scrollTop: number;
    scrollLeft: number;
}

const SELECTABLE_TYPES = new Set(["text", "search", "password", "tel", "url", "email"]);

function focusSelector(el: HTMLInputElement | HTMLTextAreaElement): string | undefined {
    const action = el.dataset["action"];
    if (action === "filter") {
        return '[data-action="filter"]';
    }
    const file = el.dataset["file"];
    if (action === "set-file-text" && file !== undefined) {
        return `[data-action="set-file-text"][data-file="${file}"]`;
    }
    const env = el.dataset["env"];
    if ((action === "set" || action === "encrypt-set") && file !== undefined && env !== undefined) {
        return `[data-action="${action}"][data-file="${file}"][data-env="${env}"]`;
    }
    return undefined;
}

function captureFocus(): FocusSnapshot | undefined {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
        return undefined;
    }
    const selector = focusSelector(el);
    if (selector === undefined) {
        return undefined;
    }
    const canSelect = el instanceof HTMLTextAreaElement || SELECTABLE_TYPES.has(el.type);
    return {
        selector,
        value: el.value,
        selStart: canSelect ? el.selectionStart : null,
        selEnd: canSelect ? el.selectionEnd : null,
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
    };
}

function restoreFocus(snapshot: FocusSnapshot): void {
    if (app === null) {
        return;
    }
    const el = app.querySelector(snapshot.selector);
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
        return;
    }
    // Keep any text typed during the async refresh window — the rebuilt field carries the model value.
    if (el.value !== snapshot.value) {
        el.value = snapshot.value;
    }
    el.focus();
    if (snapshot.selStart !== null && snapshot.selEnd !== null) {
        el.setSelectionRange(snapshot.selStart, snapshot.selEnd);
    }
    el.scrollTop = snapshot.scrollTop;
    el.scrollLeft = snapshot.scrollLeft;
    if (el instanceof HTMLTextAreaElement && el.dataset["action"] === "set-file-text") {
        syncRawHighlight(el);
    }
}

function render(): void {
    if (app === null) {
        return;
    }
    const snapshot = captureFocus();
    clear(app);
    if (state.landscape === undefined) {
        app.append(h("div", { class: "loading", text: "Scanning workspace…" }));
        return;
    }
    app.append(renderBanner(state));
    app.append(h("div", { class: "layout" }, [renderSidebar(state), renderMain()]));
    if (state.error !== undefined) {
        app.append(h("div", { class: "toast toast-error", role: "alert", text: state.error }));
    }
    if (snapshot !== undefined) {
        restoreFocus(snapshot);
    }
}

function renderMain(): HTMLElement {
    const main = h("main", { class: "main" });
    main.append(renderToolbar());
    if (state.mode === "matrix") {
        main.append(renderMatrix(state));
        return main;
    }
    const file = state.selectedFileId !== undefined ? state.landscape?.files[state.selectedFileId] : undefined;
    if (file === undefined) {
        main.append(h("div", { class: "empty", text: "Select a file from the sidebar." }));
        return main;
    }
    main.append(state.mode === "raw" ? renderRaw(file) : renderGrid(state, file));
    return main;
}

function renderToolbar(): HTMLElement {
    const tab = (mode: ViewMode, label: string): HTMLElement =>
        h("button", { class: `tab${state.mode === mode ? " active" : ""}`, "data-action": "tab", "data-mode": mode }, [label]);
    const filter = h("div", { class: "search" }, [
        h("span", { class: "search-icon" }, [icon("search")]),
        h("input", {
            class: "filter",
            type: "search",
            placeholder: "Filter variables…",
            value: state.filter,
            "data-action": "filter",
            spellcheck: "false",
        }),
    ]);
    return h("div", { class: "toolbar" }, [h("div", { class: "tabs" }, [tab("grid", "UI"), tab("matrix", "Overview"), tab("raw", "File")]), filter]);
}
