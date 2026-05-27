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
    seats_total: z.number().int().min(1).max(100),
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
  })
  .refine(
    (v) => {
      // Reject when from/to are the same point (within ~50m).
      // Quick equirectangular approx — at ~55°N: 1° lat ≈ 111km, 1° lng ≈ 64km.
      const dLat = (v.to_lat - v.from_lat) * 111_000;
      const dLng = (v.to_lng - v.from_lng) * 64_000;
      return Math.hypot(dLat, dLng) > 50;
    },
    {
      message: "Точка отправления и прибытия совпадают",
      path: ["to_label"],
    },
  );

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
  seats_total: z.number().int().min(1).max(100),
  seats_taken: z.number().int().min(0),
  comment: z.string().max(200).nullable(),
  status: RideStatus,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  driver_display_name: z.string().nullable().optional(),
  driver_photo_url: z.string().nullable().optional(),
  driver_tg_id: z.number().int().nullable().optional(),
  driver_avg_stars: z.number().nullable().optional(),
  driver_reviews_count: z.number().int().min(0).nullable().optional(),
  route_polyline: z.string().nullable().optional(),
  route_distance_m: z.number().int().nullable().optional(),
  route_duration_s: z.number().int().nullable().optional(),
});

export type RideDTO = z.infer<typeof RideDTO>;
export type RideStatus = z.infer<typeof RideStatus>;

const RIDE_CORE_KEYS = new Set([
  "id",
  "driver_id",
  "template_id",
  "from_label",
  "from_lat",
  "from_lng",
  "to_label",
  "to_lat",
  "to_lng",
  "departure_at",
  "price_rub",
  "seats_total",
  "seats_taken",
  "comment",
  "status",
  "created_at",
  "updated_at",
  "route_distance_m",
  "route_duration_s",
]);

const RIDE_LIST_KEYS = new Set([
  ...RIDE_CORE_KEYS,
  "driver_display_name",
  "driver_photo_url",
  "driver_tg_id",
  "driver_avg_stars",
  "driver_reviews_count",
]);

const RIDE_DETAIL_KEYS = new Set([
  ...RIDE_CORE_KEYS,
  "driver",
  "passengers",
  "pending_requests",
  "my_request_id",
  "my_request_status",
  "my_subscription_id",
  "my_subscription_status",
  "route_polyline",
]);

const RIDE_REQUEST_KEYS = new Set(["id", "ride_id", "passenger_id", "status", "created_at"]);

function pickKeys(row: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    if (allowed.has(k)) out[k] = row[k];
  }
  return out;
}

export function stripRide(row: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(row, RIDE_LIST_KEYS);
}

export function stripRideCore(row: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(row, RIDE_CORE_KEYS);
}

export function stripRideDetail(row: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(row, RIDE_DETAIL_KEYS);
}

export function stripRideRequest(row: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(row, RIDE_REQUEST_KEYS);
}

export const MarkParticipantsInput = z.object({
  passenger_ids: z.array(z.string().uuid()).min(1).max(50),
});
export type MarkParticipantsInput = z.infer<typeof MarkParticipantsInput>;
