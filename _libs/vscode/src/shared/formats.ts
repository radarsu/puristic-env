// Friendly presentation metadata for the Zod string formats surfaced by @puristic/env's
// inspectSchema (keyed by the raw zod format value, e.g. "ipv4"). Both the host (typeLabel) and the
// webview (input type / placeholder / inputmode) read from here.

export interface FormatMeta {
    label: string;
    example: string;
    inputType?: "url" | "email" | "date" | "time" | "datetime-local";
    inputMode?: string;
}

export const FORMAT_META: Record<string, FormatMeta> = {
    email: { label: "email", example: "name@example.com", inputType: "email", inputMode: "email" },
    url: { label: "URL", example: "https://example.com", inputType: "url", inputMode: "url" },
    uuid: { label: "UUID", example: "123e4567-e89b-12d3-a456-426614174000" },
    guid: { label: "GUID", example: "123e4567-e89b-12d3-a456-426614174000" },
    nanoid: { label: "Nano ID", example: "V1StGXR8_Z5jdHi6B-myT" },
    cuid: { label: "CUID", example: "cjld2cjxh0000qzrmn831i7rn" },
    cuid2: { label: "CUID2", example: "tz4a98xxat96iws9zmbrgj3a" },
    ulid: { label: "ULID", example: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
    xid: { label: "XID", example: "9m4e2mr0ui3e8a215n4g" },
    ksuid: { label: "KSUID", example: "2naeRjTrrHJAkfd3tOuEjw90WCA" },
    ipv4: { label: "IPv4", example: "192.168.1.1" },
    ipv6: { label: "IPv6", example: "2001:db8::1" },
    cidrv4: { label: "IPv4 CIDR", example: "192.168.1.0/24" },
    cidrv6: { label: "IPv6 CIDR", example: "2001:db8::/32" },
    datetime: { label: "date-time (ISO 8601)", example: "2024-01-15T09:30:00Z", inputType: "datetime-local" },
    date: { label: "date (ISO 8601)", example: "2024-01-15", inputType: "date" },
    time: { label: "time (ISO 8601)", example: "09:30:00", inputType: "time" },
    duration: { label: "duration (ISO 8601)", example: "P3Y6M4DT12H30M5S" },
    base64: { label: "base64", example: "SGVsbG8gd29ybGQ=" },
    base64url: { label: "base64url", example: "SGVsbG8gd29ybGQ" },
    jwt: { label: "JWT", example: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.s5d" },
    e164: { label: "phone (E.164)", example: "+14155552671" },
    emoji: { label: "emoji", example: "🎉" },
};

// Native date/time pickers can't hold a timezone, while zod's z.iso.datetime() requires one. These
// bridge the picker value and the stored value. Only `datetime` needs real work — `date`/`time` use
// the same lexical form on both sides. The UTC assumption: a picker time with no zone is stored as Z.

export function toInputValue(format: string, stored: string): string {
    if (format === "datetime" && stored !== "") {
        // Drop a trailing "Z" or numeric offset so datetime-local accepts the value.
        return stored.replace(/(Z|[+-]\d{2}:\d{2})$/, "");
    }
    return stored;
}

export function fromInputValue(format: string, pickerValue: string): string {
    if (format === "datetime" && pickerValue !== "" && !/(Z|[+-]\d{2}:\d{2})$/.test(pickerValue)) {
        return `${pickerValue}Z`;
    }
    return pickerValue;
}
