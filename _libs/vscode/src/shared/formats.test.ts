import { describe, expect, it } from "vitest";
import { FORMAT_META, fromInputValue, toInputValue } from "./formats.js";

describe("FORMAT_META", () => {
    it("covers the zod string formats with a label and example", () => {
        const formats = [
            "email",
            "url",
            "uuid",
            "guid",
            "nanoid",
            "cuid",
            "cuid2",
            "ulid",
            "xid",
            "ksuid",
            "ipv4",
            "ipv6",
            "cidrv4",
            "cidrv6",
            "datetime",
            "date",
            "time",
            "duration",
            "base64",
            "base64url",
            "jwt",
            "e164",
            "emoji",
        ];
        for (const format of formats) {
            const meta = FORMAT_META[format];
            expect(meta, format).toBeDefined();
            expect(meta?.label).toBeTruthy();
            expect(meta?.example).toBeTruthy();
        }
    });

    it("uses native input types only for date/time and email/url", () => {
        expect(FORMAT_META["datetime"]?.inputType).toBe("datetime-local");
        expect(FORMAT_META["date"]?.inputType).toBe("date");
        expect(FORMAT_META["time"]?.inputType).toBe("time");
        expect(FORMAT_META["email"]?.inputType).toBe("email");
        expect(FORMAT_META["url"]?.inputType).toBe("url");
        expect(FORMAT_META["ipv4"]?.inputType).toBeUndefined();
    });
});

describe("datetime conversion", () => {
    it("appends Z when the picker value has no zone", () => {
        expect(fromInputValue("datetime", "2024-01-15T09:30")).toBe("2024-01-15T09:30Z");
        expect(fromInputValue("datetime", "2024-01-15T09:30:00")).toBe("2024-01-15T09:30:00Z");
    });

    it("leaves an already-zoned value untouched", () => {
        expect(fromInputValue("datetime", "2024-01-15T09:30:00Z")).toBe("2024-01-15T09:30:00Z");
        expect(fromInputValue("datetime", "2024-01-15T09:30:00+02:00")).toBe("2024-01-15T09:30:00+02:00");
    });

    it("strips the zone so an ISO value loads into the picker", () => {
        expect(toInputValue("datetime", "2024-01-15T09:30:00Z")).toBe("2024-01-15T09:30:00");
        expect(toInputValue("datetime", "2024-01-15T09:30:00+02:00")).toBe("2024-01-15T09:30:00");
    });

    it("passes empty values through", () => {
        expect(fromInputValue("datetime", "")).toBe("");
        expect(toInputValue("datetime", "")).toBe("");
    });
});

describe("date/time conversion", () => {
    it("is identity for date and time", () => {
        expect(fromInputValue("date", "2024-01-15")).toBe("2024-01-15");
        expect(toInputValue("date", "2024-01-15")).toBe("2024-01-15");
        expect(fromInputValue("time", "09:30:00")).toBe("09:30:00");
        expect(toInputValue("time", "09:30:00")).toBe("09:30:00");
    });

    it("is identity for non-temporal formats", () => {
        expect(fromInputValue("ipv4", "192.168.1.1")).toBe("192.168.1.1");
        expect(toInputValue("ipv4", "192.168.1.1")).toBe("192.168.1.1");
    });
});
