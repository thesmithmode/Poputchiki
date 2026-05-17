import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export interface UserNotification {
  id: string;
  category: string;
  ride_id: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<{ notifications: UserNotification[] }>("/notifications"),
    refetchInterval: 30_000,
  });
}
