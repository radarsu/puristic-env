import type { VarStatus } from "@puristic/env/index.js";
import { FORMAT_META, toInputValue } from "../../shared/formats.js";
import type { FileView, VarRow } from "../../shared/protocol.js";
import { h } from "../dom.js";
import { icon } from "../icons.js";
import type { AppState } from "../state.js";
import { STATUS_ICON, STATUS_LABEL } from "./status.js";

const ERROR_STATUSES = new Set<VarStatus>(["missing-required", "invalid", "secret-plaintext"]);

export function renderGrid(state: AppState, file: FileView): HTMLElement {
    const container = h("div", { class: "grid" });
    container.append(renderGridHeader(file));

    if (!file.hasSchema) {
        const note =
            file.configError !== undefined
                ? `Config failed to load: ${file.configError}`
                : "No env.config governs this directory — editing as plain key/value.";
        container.append(h("div", { class: `notice ${file.configError !== undefined ? "notice-error" : "notice-info"}`, text: note }));
    }

    const rows = file.rows.filter((row) => matchesFilter(row, state.filter));
    if (rows.length === 0) {
        container.append(h("div", { class: "empty", text: "No variables match the filter." }));
        return container;
    }

    const groups = new Map<string, VarRow[]>();
    const order: string[] = [];
    for (const row of rows) {
        const existing = groups.get(row.group);
        if (existing === undefined) {
            groups.set(row.group, [row]);
            order.push(row.group);
        } else {
            existing.push(row);
        }
    }
    for (const group of order) {
        container.append(renderCard(state, file.fileId, group, groups.get(group) ?? []));
    }
    return container;
}

function renderCard(state: AppState, fileId: string, group: string, rows: VarRow[]): HTMLElement {
    const header = h("div", { class: "card-header" }, [
        h("span", { class: "card-icon" }, [icon("info")]),
        h("span", { class: "card-title", text: group === "" ? "Top level" : group }),
    ]);
    const body = h(
        "div",
        { class: "card-body" },
        rows.map((row) => renderRow(state, fileId, row)),
    );
    return h("section", { class: `card ${cardTone(rows)}` }, [header, body]);
}

function cardTone(rows: VarRow[]): string {
    if (rows.some((row) => ERROR_STATUSES.has(row.status))) {
        return "error";
    }
    return rows.some((row) => row.status === "unknown") ? "warn" : "";
}

function renderGridHeader(file: FileView): HTMLElement {
    const actions = h("div", { class: "grid-actions" }, [
        h("button", { class: "btn", "data-action": "add-all", "data-file": file.fileId, title: "Add every missing/defaulted key to this file" }, [
            "Add all missing",
        ]),
        file.fileName === ".env" || file.fileName === ".env.local"
            ? h(
                  "button",
                  {
                      class: "btn",
                      "data-action": "copy-preset",
                      "data-file": file.fileId,
                      title: "Merge keys from a sibling .env.<preset> file into this file",
                  },
                  ["Copy from preset…"],
              )
            : undefined,
        file.dirty ? h("button", { class: "btn", "data-action": "save", "data-file": file.fileId }, ["Save"]) : undefined,
        file.dirty
            ? h(
                  "button",
                  { class: "btn btn-ghost", "data-action": "discard", "data-file": file.fileId, title: "Revert unsaved changes to the last saved version" },
                  ["Discard changes"],
              )
            : undefined,
        h("button", { class: "btn btn-ghost", "data-action": "open-text", "data-file": file.fileId, title: "Open as plain text" }, ["Plain text"]),
    ]);
    return h("div", { class: "grid-header" }, [actions]);
}

function renderRow(state: AppState, fileId: string, row: VarRow): HTMLElement {
    const name = h("div", { class: "cell-name", title: row.envName }, [
        h("span", { class: "var-display", text: row.displayName }, [
            row.required ? h("span", { class: "required", title: "required", text: " *" }) : undefined,
        ]),
        row.typeLabel === "" ? undefined : h("span", { class: "var-type", text: row.typeLabel }),
    ]);

    const value = h("div", { class: "cell-value" }, [
        renderControl(state, fileId, row),
        row.message === undefined
            ? undefined
            : h("div", { class: `field-message${ERROR_STATUSES.has(row.status) ? " error" : ""}`, text: row.message }),
    ]);

    const chipChildren =
        row.status === "secret-encrypted"
            ? [icon("lock"), STATUS_LABEL[row.status]]
            : row.status === "using-default"
              ? [STATUS_LABEL[row.status]]
              : [`${STATUS_ICON[row.status]} ${STATUS_LABEL[row.status]}`.trim()];
    const status = h("div", { class: "cell-status" }, [
        h("span", { class: `chip chip-${row.status}`, title: row.message ?? STATUS_LABEL[row.status] }, chipChildren),
    ]);

    return h("div", { class: `row row-${row.status}`, role: "row" }, [name, value, status, renderActions(fileId, row)]);
}

function renderControl(state: AppState, fileId: string, row: VarRow): HTMLElement {
    if (row.secret) {
        return renderSecretControl(state, fileId, row);
    }
    if (row.enumValues !== undefined) {
        return renderSelect(fileId, row, row.enumValues);
    }
    if (row.control === "boolean") {
        return renderSelect(fileId, row, ["true", "false"]);
    }
    const meta = row.format !== undefined ? FORMAT_META[row.format] : undefined;
    const type = meta?.inputType ?? (row.control === "number" ? "number" : "text");
    const isPicker = type === "date" || type === "time" || type === "datetime-local";
    // Native pickers can't hold a timezone; show the picker-friendly value and convert back on change.
    const value = isPicker && row.format !== undefined ? toInputValue(row.format, row.rawValue ?? "") : (row.rawValue ?? "");
    // The compiled zod regex drives the :invalid red border (text-like inputs only); pickers self-validate.
    const pattern = !isPicker && type !== "number" ? row.pattern : undefined;
    return h("input", {
        class: "value-input",
        type,
        "data-action": "set",
        "data-file": fileId,
        "data-env": row.envName,
        "data-format": row.format,
        value,
        placeholder: row.defaultValue ?? meta?.example ?? "",
        title: meta !== undefined ? `Expected ${meta.label} — e.g. ${meta.example}` : undefined,
        inputmode: meta?.inputMode,
        pattern,
        spellcheck: "false",
        min: row.min !== undefined ? String(row.min) : undefined,
        max: row.max !== undefined ? String(row.max) : undefined,
        step: row.step !== undefined ? String(row.step) : undefined,
        minlength: row.minLength !== undefined ? String(row.minLength) : undefined,
        maxlength: row.maxLength !== undefined ? String(row.maxLength) : undefined,
    });
}

function renderSelect(fileId: string, row: VarRow, options: string[]): HTMLSelectElement {
    const select = h("select", { class: "value-input", "data-action": "set", "data-file": fileId, "data-env": row.envName }) as HTMLSelectElement;
    select.append(h("option", { value: "" }, [row.present ? "" : "(unset)"]));
    for (const option of options) {
        select.append(h("option", { value: option }, [option]));
    }
    select.value = row.rawValue ?? "";
    return select;
}

function renderSecretControl(state: AppState, fileId: string, row: VarRow): HTMLElement {
    if (state.revealSecrets && row.decrypted !== undefined) {
        return h("input", {
            class: "value-input",
            type: "text",
            "data-action": "encrypt-set",
            "data-file": fileId,
            "data-env": row.envName,
            value: row.decrypted,
            spellcheck: "false",
        });
    }
    const placeholder = row.isEncrypted ? "encrypted (type to replace)" : "enter secret value";
    return h("input", {
        class: "value-input",
        type: "password",
        "data-action": "encrypt-set",
        "data-file": fileId,
        "data-env": row.envName,
        placeholder,
        spellcheck: "false",
    });
}

function renderActions(fileId: string, row: VarRow): HTMLElement {
    const actions = h("div", { class: "cell-actions" });
    if (row.status === "using-default" && row.defaultValue !== undefined) {
        actions.append(
            h(
                "button",
                {
                    class: "btn btn-ghost",
                    "data-action": "use-default",
                    "data-file": fileId,
                    "data-env": row.envName,
                    "data-default": row.defaultValue,
                },
                ["Use default"],
            ),
        );
    }
    if (row.status === "unknown") {
        actions.append(h("button", { class: "btn btn-ghost", "data-action": "remove", "data-file": fileId, "data-env": row.envName }, ["Remove"]));
    }
    if (!row.secret && row.present && row.hasDefault) {
        actions.append(
            h(
                "button",
                {
                    class: "btn btn-ghost",
                    "data-action": "reset",
                    "data-file": fileId,
                    "data-env": row.envName,
                    title: "Remove override, fall back to schema default",
                },
                ["Reset"],
            ),
        );
    }
    if (row.status === "secret-plaintext" && row.rawValue !== undefined) {
        actions.append(
            h(
                "button",
                { class: "btn", "data-action": "encrypt-existing", "data-file": fileId, "data-env": row.envName, "data-plaintext": row.rawValue },
                ["Encrypt"],
            ),
        );
    }
    return actions;
}

function matchesFilter(row: VarRow, filter: string): boolean {
    if (filter === "") {
        return true;
    }
    const needle = filter.toLowerCase();
    return row.envName.toLowerCase().includes(needle) || row.displayName.toLowerCase().includes(needle);
}
