import { z } from "zod";
import { sanitizeText } from "../sanitize/index.js";

export const SupportMessageInput = z.object({
  body: z
    .string()
    .min(1)
    .max(1000)
    .transform((s) => sanitizeText(s, 1000)),
});

export type SupportMessageInput = z.infer<typeof SupportMessageInput>;
