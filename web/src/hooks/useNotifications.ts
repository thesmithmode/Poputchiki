import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/notifications/${id}/read`, { method: "POST" }),
    // The badge derives from the same ["notifications"] cache entry, so a
    // single invalidate refreshes both the EventsScreen list and the
    // BottomTabBar dot. We intentionally do NOT touch a separate
    // ["notifications", "unread-count"] key — it doesn't exist.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
