import { z } from "zod";

export const RideStatus = z.enum(["active", "cancelled", "completed", "archived"]);

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
