import { z } from "zod";
import { sanitizeText } from "../sanitize/index.js";

export const UserProfileInput = z.object({
  display_name: z
    .string()
    .min(1)
    .max(100)
    .transform((s) => sanitizeText(s, 100)),
  notify_disabled: z.boolean().optional(),
});

export type UserProfileInput = z.infer<typeof UserProfileInput>;

export const UserDTO = z.object({
  id: z.string().uuid(),
  tg_id: z.number().int(),
  tg_username: z.string().optional(),
  display_name: z.string().min(1),
  avatar_url: z.string().url().optional(),
  is_verified: z.boolean(),
  is_banned: z.boolean(),
  notify_disabled: z.boolean(),
  role: z.enum(["user", "admin"]),
  likes_received_count: z.number().int().min(0),
  rides_total_count: z.number().int().min(0),
  rides_completed_count: z.number().int().min(0),
  created_at: z.string().datetime(),
  last_seen_at: z.string().datetime(),
});

export type UserDTO = z.infer<typeof UserDTO>;
