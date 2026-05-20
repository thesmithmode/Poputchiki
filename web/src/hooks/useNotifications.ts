import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

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
    queryKey: queryKeys.notifications.all,
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
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

/**
 * Inline accept/reject from the notification card.
 *
 * After the driver's call, both the request status changes AND a feed row is
 * enqueued for the passenger via the API. We invalidate `notifications` so
 * the driver's own card flips to read state, and `ride` so any open detail
 * view reflects the new request state.
 */
export function useRespondRideRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, action }: { requestId: string; action: "accept" | "reject" }) =>
      apiFetch<{ id: string; status: string }>(`/ride-requests/${requestId}/${action}`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
      qc.invalidateQueries({ queryKey: queryKeys.ride.all });
    },
  });
}
