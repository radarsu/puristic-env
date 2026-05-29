import { describe, expect, it } from "vitest";
import { expandEnv, expandValue } from "./expandEnv.js";

describe("expandValue", () => {
    const lookup = (name: string): string | undefined => ({ HOST: "localhost", PORT: "5432" })[name];

    it("expands ${VAR} and $VAR", () => {
        expect(expandValue("http://${HOST}:$PORT/db", lookup)).toBe("http://localhost:5432/db");
    });

    it("expands an unresolved reference to an empty string", () => {
        expect(expandValue("a${MISSING}b", lookup)).toBe("ab");
    });

    it("treats \\$ as a literal dollar and leaves the following name untouched", () => {
        expect(expandValue("price=\\$5 and ${HOST}", lookup)).toBe("price=$5 and localhost");
        expect(expandValue("\\${HOST}", lookup)).toBe("${HOST}");
    });

    it("leaves a lone $ or $-not-a-name as-is", () => {
        expect(expandValue("100% $ off", lookup)).toBe("100% $ off");
    });
});

describe("expandEnv", () => {
    it("resolves sibling references within the record", () => {
        expect(expandEnv({ HOST: "localhost", URL: "http://${HOST}/app" })).toEqual({
            HOST: "localhost",
            URL: "http://localhost/app",
        });
    });

    it("prefers a sibling value over the ambient lookup", () => {
        const result = expandEnv({ HOST: "sibling", URL: "${HOST}" }, (name) => (name === "HOST" ? "ambient" : undefined));
        expect(result["URL"]).toBe("sibling");
    });

    it("falls back to the ambient lookup for keys absent from the record", () => {
        const result = expandEnv({ URL: "${HOST}/db" }, (name) => (name === "HOST" ? "ambient" : undefined));
        expect(result["URL"]).toBe("ambient/db");
    });

    it("resolves chained references to a fixpoint", () => {
        expect(expandEnv({ A: "${B}", B: "${C}", C: "deep" })).toEqual({ A: "deep", B: "deep", C: "deep" });
    });

    it("breaks reference cycles by resolving to an empty string", () => {
        const result = expandEnv({ A: "${B}", B: "${A}" });
        expect(result).toEqual({ A: "", B: "" });
    });
});
