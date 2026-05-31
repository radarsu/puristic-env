// Crisp inline-SVG icons built with createElementNS (CSP-safe, no innerHTML, no icon font).
// Each renders at 14px and inherits `currentColor`, so CSS controls the color.

const SVG_NS = "http://www.w3.org/2000/svg";

export type IconName = "check" | "alert" | "warn" | "dot" | "search" | "box" | "info" | "lock";

interface Shape {
    tag: "path" | "circle" | "line";
    attrs: Record<string, string>;
}

const FILLED_DOT = (cy: string): Shape => ({ tag: "circle", attrs: { cx: "12", cy, r: "1.1", fill: "currentColor", stroke: "none" } });

const SHAPES: Record<IconName, Shape[]> = {
    check: [
        { tag: "circle", attrs: { cx: "12", cy: "12", r: "9" } },
        { tag: "path", attrs: { d: "M8.5 12.5l2.4 2.4 4.6-5.2" } },
    ],
    alert: [
        { tag: "circle", attrs: { cx: "12", cy: "12", r: "9" } },
        { tag: "line", attrs: { x1: "12", y1: "7.5", x2: "12", y2: "13" } },
        FILLED_DOT("16.3"),
    ],
    warn: [
        { tag: "path", attrs: { d: "M12 3.5 21.5 20.5 2.5 20.5Z" } },
        { tag: "line", attrs: { x1: "12", y1: "10", x2: "12", y2: "15" } },
        FILLED_DOT("18"),
    ],
    dot: [{ tag: "circle", attrs: { cx: "12", cy: "12", r: "4", fill: "currentColor", stroke: "none" } }],
    search: [
        { tag: "circle", attrs: { cx: "11", cy: "11", r: "7" } },
        { tag: "line", attrs: { x1: "16.5", y1: "16.5", x2: "21", y2: "21" } },
    ],
    box: [
        { tag: "path", attrs: { d: "M3 7.5 12 3l9 4.5-9 4.5z" } },
        { tag: "path", attrs: { d: "M3 7.5v9l9 4.5 9-4.5v-9" } },
    ],
    info: [
        { tag: "circle", attrs: { cx: "12", cy: "12", r: "9" } },
        { tag: "line", attrs: { x1: "12", y1: "11", x2: "12", y2: "16" } },
        FILLED_DOT("8"),
    ],
    lock: [
        { tag: "path", attrs: { d: "M6 11h12v9H6z" } },
        { tag: "path", attrs: { d: "M8.5 11V8a3.5 3.5 0 0 1 7 0v3" } },
        FILLED_DOT("15"),
    ],
};

export function icon(name: IconName): SVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("icon", `icon-${name}`);
    for (const shape of SHAPES[name]) {
        const node = document.createElementNS(SVG_NS, shape.tag);
        for (const [key, value] of Object.entries(shape.attrs)) {
            node.setAttribute(key, value);
        }
        svg.append(node);
    }
    return svg;
}
