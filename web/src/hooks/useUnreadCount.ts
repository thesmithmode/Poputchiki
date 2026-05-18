import { useNotifications } from "./useNotifications";

/**
 * Badge counter. Reuses the `useNotifications` query so both the
 * BottomTabBar dot and the EventsScreen header read from the same
 * react-query cache entry — invalidate-on-write keeps them in sync
 * without duplicate network traffic.
 */
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return data?.notifications.filter((n) => !n.is_read).length ?? 0;
}
