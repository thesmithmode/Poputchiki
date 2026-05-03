import { z } from "zod";
import { sanitizeText } from "../sanitize/index.js";

export const CreateReviewInput = z.object({
  ride_id: z.string().uuid(),
  target_id: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  body: z
    .string()
    .max(300)
    .nullable()
    .optional()
    .transform((s) => (s != null ? sanitizeText(s, 300) : s)),
});

export type CreateReviewInput = z.infer<typeof CreateReviewInput>;

export const ReviewDTO = z.object({
  id: z.string().uuid(),
  ride_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  target_id: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  text: z.string().max(300).nullable(),
  created_at: z.string().datetime(),
});

export type ReviewDTO = z.infer<typeof ReviewDTO>;
