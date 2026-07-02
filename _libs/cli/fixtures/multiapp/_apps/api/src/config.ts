import { z } from "zod";

export default {
    schema: z.object({
        databaseUrl: z.string(),
        apiUrl: z.string(),
        apiPort: z.coerce.number().default(3000),
    }),
    sources: [],
};
