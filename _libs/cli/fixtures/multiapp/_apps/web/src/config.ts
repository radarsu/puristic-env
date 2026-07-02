import { z } from "zod";

export default {
    schema: z.object({
        apiUrl: z.string(),
        webOrigin: z.string(),
    }),
    sources: [],
};
