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

interface NotificationsCache {
  notifications: UserNotification[];
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: () => apiFetch<NotificationsCache>("/notifications"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Оптимистично пометить одно уведомление прочитанным.
 *
 * onMutate ставит is_read=true в кэше до резолва POST. На ошибку —
 * rollback из snapshot. На settle — invalidate, чтобы сервер дал
 * фактическое состояние (на случай гонки с другими источниками
 * notifications: SSE, другая вкладка).
 *
 * Badge counter (useUnreadCount) и список (EventsScreen) читают тот же
 * кэш — оптимистичный апдейт мгновенно красит и точку, и строку.
 */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const key = queryKeys.notifications.all;
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/notifications/${id}/read`, { method: "POST" }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NotificationsCache>(key);
      if (previous) {
        qc.setQueryData<NotificationsCache>(key, {
          notifications: previous.notifications.map((n) =>
            n.id === id ? { ...n, is_read: true } : n,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Оптимистично пометить все непрочитанные прочитанными.
 *
 * Apuestas: snapshot всего объекта, затем map всех с is_read=true.
 * Rollback восстанавливает исходные is_read (включая те, что были true).
 */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const key = queryKeys.notifications.all;
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>("/notifications/read-all", { method: "POST" }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NotificationsCache>(key);
      if (previous) {
        qc.setQueryData<NotificationsCache>(key, {
          notifications: previous.notifications.map((n) => ({ ...n, is_read: true })),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Inline accept/reject из карточки уведомления (драйверское действие).
 *
 * После вызова API меняется статус request И добавляется feed-row пассажиру.
 * Оптимистично НЕ обновляем notifications-список — карточка остаётся
 * как есть до приходящего обновления через invalidate. Причина: ответ
 * сервера несёт ID нового feed-row пассажира и обновлённый статус;
 * placeholder вне локального контекста рисовать смысла нет. Но invalidate
 * на settled — обязателен, и для notifications, и для ride.
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
