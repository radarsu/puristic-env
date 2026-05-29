import "./styles.css";
import { fromInputValue } from "../shared/formats.js";
import type { HostToWebview } from "../shared/protocol.js";
import { send, vscode } from "./api.js";
import { clear, h } from "./dom.js";
import { icon } from "./icons.js";
import { renderBanner } from "./render/banner.js";
import { renderGrid } from "./render/grid.js";
import { renderMatrix } from "./render/matrix.js";
import { renderSidebar } from "./render/sidebar.js";
import { type AppState, type PersistedState, revealKey, type ViewMode } from "./state.js";

const app = document.getElementById("app");
const persisted = vscode.getState<PersistedState>();

const state: AppState = {
    landscape: undefined,
    selectedFileId: persisted?.selectedFileId,
    mode: persisted?.mode ?? "grid",
    filter: persisted?.filter ?? "",
    revealed: new Map(),
    error: undefined,
};

let revealSeq = 0;
let refocusFilter = false;

if (app !== null) {
    window.addEventListener("message", (event: MessageEvent<HostToWebview>) => onMessage(event.data));
    app.addEventListener("click", onClick);
    app.addEventListener("change", onChange);
    app.addEventListener("input", onInput);
    send({ type: "ready" });
}

function persist(): void {
    vscode.setState<PersistedState>({ selectedFileId: state.selectedFileId, mode: state.mode, filter: state.filter });
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
        case "revealSecretResult":
            if (message.ok && message.value !== undefined) {
                state.revealed.set(revealKey(message.fileId, message.envName), message.value);
            } else {
                state.error = message.message ?? "Could not reveal secret";
            }
            render();
            return;
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
        case "use-default":
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
        case "reveal":
            if (file !== undefined && env !== undefined) {
                send({ type: "revealSecret", requestId: `r${revealSeq++}`, fileId: file, envName: env });
            }
            return;
        case "hide":
            if (file !== undefined && env !== undefined) {
                state.revealed.delete(revealKey(file, env));
                render();
            }
            return;
        case "add-all":
            if (file !== undefined) {
                send({ type: "addAllMissing", fileId: file });
            }
            return;
        case "encrypt-all-secrets":
            if (file !== undefined) {
                send({ type: "encryptAllSecrets", fileId: file });
            }
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

function onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
        return;
    }
    const action = target.dataset["action"];
    const file = target.dataset["file"];
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

function onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset["action"] === "filter") {
        state.filter = target.value;
        refocusFilter = true;
        persist();
        render();
    }
}

function render(): void {
    if (app === null) {
        return;
    }
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
    if (refocusFilter) {
        refocusFilter = false;
        const input = app.querySelector<HTMLInputElement>('[data-action="filter"]');
        if (input !== null) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }
}

function renderMain(): HTMLElement {
    const main = h("main", { class: "main" });
    main.append(renderToolbar());
    if (state.mode === "grid") {
        const file = state.selectedFileId !== undefined ? state.landscape?.files[state.selectedFileId] : undefined;
        main.append(file !== undefined ? renderGrid(state, file) : h("div", { class: "empty", text: "Select a file from the sidebar." }));
    } else {
        main.append(renderMatrix(state));
    }
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
    return h("div", { class: "toolbar" }, [h("div", { class: "tabs" }, [tab("grid", "File"), tab("matrix", "Overview")]), filter]);
}
