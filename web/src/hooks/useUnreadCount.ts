import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { UserNotification } from "./useNotifications";

export function useUnreadCount(): number {
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<{ notifications: UserNotification[] }>("/notifications"),
    refetchInterval: 30_000,
  });
  return data?.notifications.filter((n) => !n.is_read).length ?? 0;
}
