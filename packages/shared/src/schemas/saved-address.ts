import { z } from "zod";
import { sanitizeText } from "../sanitize/index.js";

export const SavedAddressType = z.enum(["home", "work", "custom"]);

export const CreateSavedAddressInput = z.object({
  type: SavedAddressType,
  name: z
    .string()
    .min(1)
    .max(50)
    .transform((s) => sanitizeText(s, 50)),
  address_label: z
    .string()
    .min(1)
    .max(200)
    .transform((s) => sanitizeText(s, 200)),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const UpdateSavedAddressInput = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .transform((s) => sanitizeText(s, 50))
    .optional(),
  address_label: z
    .string()
    .min(1)
    .max(200)
    .transform((s) => sanitizeText(s, 200))
    .optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const SavedAddressDTO = z.object({
  id: z.string().uuid(),
  type: SavedAddressType,
  name: z.string(),
  address_label: z.string(),
  lat: z.number(),
  lng: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type SavedAddressDTO = z.infer<typeof SavedAddressDTO>;
export type CreateSavedAddressInput = z.infer<typeof CreateSavedAddressInput>;
export type UpdateSavedAddressInput = z.infer<typeof UpdateSavedAddressInput>;
