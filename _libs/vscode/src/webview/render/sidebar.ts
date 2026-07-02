import type { BadgeStatus, DirView } from "../../shared/protocol.js";
import { h } from "../dom.js";
import { type IconName, icon } from "../icons.js";
import type { AppState } from "../state.js";

const BADGE_ICONS: Record<BadgeStatus, IconName> = { ok: "check", warn: "warn", error: "alert", none: "dot" };

export function renderSidebar(state: AppState): HTMLElement {
    const sidebar = h("nav", { class: "sidebar", "aria-label": "Services" }, [h("div", { class: "sidebar-title", text: "Services" })]);
    const landscape = state.landscape;
    if (landscape === undefined) {
        return sidebar;
    }
    if (landscape.dirs.length === 0) {
        sidebar.append(h("div", { class: "sidebar-empty", text: "No .env files found." }));
        return sidebar;
    }
    for (const dir of landscape.dirs) {
        sidebar.append(renderDir(state, dir));
    }
    return sidebar;
}

function renderDir(state: AppState, dir: DirView): HTMLElement {
    const header = h("div", { class: "service" }, [
        h("span", { class: "service-icon" }, [icon("box")]),
        h("span", { class: "service-label", text: dir.label, title: dir.dirId }),
        statusIcon(dir.badge),
    ]);
    const files = dir.fileIds.map((fileId) => renderFile(state, fileId));
    return h("section", { class: "dir" }, [header, ...files]);
}

function renderFile(state: AppState, fileId: string): HTMLElement {
    const file = state.landscape?.files[fileId];
    if (file === undefined) {
        return h("div");
    }
    const selected = state.selectedFileId === fileId;
    // A file governed by more than one schema (a shared root .env) lists the apps it spans.
    const apps = file.apps !== undefined && file.apps.length > 1 ? file.apps.join(", ") : undefined;
    return h("button", { class: `file-item${selected ? " selected" : ""}`, "data-action": "select-file", "data-file": fileId }, [
        statusIcon(file.badge),
        h("span", { class: "file-name", text: file.fileName }),
        apps !== undefined ? h("span", { class: "file-apps", title: `Shared by ${apps}`, text: apps }) : undefined,
        file.dirty ? h("span", { class: "dirty-dot", title: "Unsaved changes", text: "●" }) : undefined,
    ]);
}

function statusIcon(badge: BadgeStatus): HTMLElement {
    return h("span", { class: `status-icon status-${badge}` }, [icon(BADGE_ICONS[badge])]);
}
