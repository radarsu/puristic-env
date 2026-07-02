import type { MatrixColumn, MatrixSection } from "../../shared/protocol.js";
import { h } from "../dom.js";
import { icon } from "../icons.js";
import type { AppState } from "../state.js";
import { STATUS_ICON, STATUS_LABEL } from "./status.js";

export function renderMatrix(state: AppState): HTMLElement {
    const landscape = state.landscape;
    const container = h("div", { class: "matrix-wrap" });
    if (landscape === undefined || landscape.matrix.length === 0) {
        container.append(h("div", { class: "empty", text: "No schema-backed .env files to compare." }));
        return container;
    }
    for (const section of landscape.matrix) {
        container.append(renderSection(section, landscape.columns, state.filter));
    }
    return container;
}

function renderSection(section: MatrixSection, columns: MatrixColumn[], filter: string): HTMLElement {
    const head = h("tr", {}, [h("th", { class: "matrix-key", text: "Variable" }), ...columns.map(renderColumnHeader)]);
    const rows = section.rows.filter((row) => matches(row.envName, filter));
    const body = rows.map((row) => {
        const cells = columns.map((column) => renderCell(row.cells[column.fileId] ?? "n/a", column, row.envName));
        return h("tr", {}, [h("th", { class: "matrix-key", title: row.envName, text: row.envName }), ...cells]);
    });
    const table = h("table", { class: "matrix" }, [h("thead", {}, [head]), h("tbody", {}, body)]);
    return h("section", { class: "matrix-section" }, [
        h("h3", { class: "matrix-service", title: section.service, text: section.app ?? section.service }),
        table,
    ]);
}

function renderColumnHeader(column: MatrixColumn): HTMLElement {
    const dirLabel = column.dirId === "" ? "(root)" : (column.dirId.split("/").pop() ?? column.dirId);
    return h("th", { class: "matrix-col", title: column.fileId }, [
        h("div", { text: dirLabel }),
        h("div", { class: "matrix-col-file", text: column.fileName }),
    ]);
}

function renderCell(status: string, column: MatrixColumn, envName: string): HTMLElement {
    if (status === "n/a") {
        return h("td", { class: "matrix-cell na", text: "·" });
    }
    const label = STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status;
    const mark: Node | string = status === "secret-encrypted" ? icon("lock") : STATUS_ICON[status as keyof typeof STATUS_ICON] || "•";
    return h(
        "td",
        {
            class: `matrix-cell chip-${status}`,
            "data-action": "cell",
            "data-file": column.fileId,
            "data-env": envName,
            title: `${column.fileId} — ${label}`,
        },
        [mark],
    );
}

function matches(envName: string, filter: string): boolean {
    return filter === "" || envName.toLowerCase().includes(filter.toLowerCase());
}
