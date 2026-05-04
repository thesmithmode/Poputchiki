import { z } from "zod";

export const LikeDTO = z.object({
  id: z.string().uuid(),
  subject_id: z.string().uuid(),
  target_id: z.string().uuid(),
  ride_id: z.string().uuid(),
  created_at: z.string().datetime(),
});

export type LikeDTO = z.infer<typeof LikeDTO>;
