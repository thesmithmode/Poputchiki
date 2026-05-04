import { z } from "zod";
import { sanitizeText } from "../sanitize/index.js";

export const ComplaintInput = z.object({
  target_id: z.string().uuid(),
  ride_id: z.string().uuid().nullable().optional(),
  body: z
    .string()
    .min(1)
    .max(500)
    .transform((s) => sanitizeText(s, 500)),
});

export type ComplaintInput = z.infer<typeof ComplaintInput>;
