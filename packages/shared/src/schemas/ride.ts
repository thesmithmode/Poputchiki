import { z } from "zod";
import { sanitizeText } from "../sanitize/index.js";

export const RideStatus = z.enum(["active", "cancelled", "completed", "archived"]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const CreateRideInput = z
  .object({
    from_label: z
      .string()
      .min(1)
      .max(200)
      .transform((s) => sanitizeText(s, 200)),
    from_lat: z.number().min(-90).max(90),
    from_lng: z.number().min(-180).max(180),
    to_label: z
      .string()
      .min(1)
      .max(200)
      .transform((s) => sanitizeText(s, 200)),
    to_lat: z.number().min(-90).max(90),
    to_lng: z.number().min(-180).max(180),
    departure_at: z.string().datetime(),
    price_rub: z.number().int().positive().nullable().optional(),
    seats_total: z.number().int().min(1).max(4),
    comment: z
      .string()
      .max(200)
      .nullable()
      .optional()
      .transform((s) => (s != null ? sanitizeText(s, 200) : s)),
    template_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => new Date(v.departure_at) > new Date(), {
    message: "departure_at must be in the future",
    path: ["departure_at"],
  })
  .refine((v) => new Date(v.departure_at) <= new Date(Date.now() + 30 * MS_PER_DAY), {
    message: "departure_at must be within 30 days",
    path: ["departure_at"],
  });

export type CreateRideInput = z.infer<typeof CreateRideInput>;

export const RideDTO = z.object({
  id: z.string().uuid(),
  driver_id: z.string().uuid(),
  template_id: z.string().uuid().nullable(),
  from_label: z.string().min(1),
  from_lat: z.number().min(-90).max(90),
  from_lng: z.number().min(-180).max(180),
  to_label: z.string().min(1),
  to_lat: z.number().min(-90).max(90),
  to_lng: z.number().min(-180).max(180),
  departure_at: z.string().datetime(),
  price_rub: z.number().int().positive().nullable(),
  seats_total: z.number().int().min(1).max(4),
  seats_taken: z.number().int().min(0),
  comment: z.string().max(200).nullable(),
  status: RideStatus,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type RideDTO = z.infer<typeof RideDTO>;
export type RideStatus = z.infer<typeof RideStatus>;

export const MarkParticipantsInput = z.object({
  passenger_ids: z.array(z.string().uuid()).min(1).max(50),
});
export type MarkParticipantsInput = z.infer<typeof MarkParticipantsInput>;
