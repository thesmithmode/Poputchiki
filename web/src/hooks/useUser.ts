import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface UserStats {
  rides_as_driver_completed: number;
  rides_as_passenger: number;
  likes_received: number;
  avg_stars: number | null;
  reviews_count: number;
}

export interface PublicUser {
  id: string;
  tg_username: string | null;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  stats: UserStats;
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => apiFetch<PublicUser>(`/users/${id}`),
    enabled: !!id,
  });
}
