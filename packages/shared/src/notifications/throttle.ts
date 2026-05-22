import type { NotificationCategory } from "./categories.js";

/**
 * Per-recipient throttle: защита от спама inbox. Конфиг в одном месте.
 * Значение null = без лимита (system / admin-категории).
 *
 * Окно: rolling 1 час по created_at.
 */
export const NOTIFICATION_HOURLY_LIMITS: Record<NotificationCategory, number | null> = {
  ride_request: 50,
  ride_request_accepted: 100,
  ride_request_rejected: 100,
  ride_request_cancelled: 100,
  ride_cancelled: 100,
  ride_completed: 100,
  confirm_participation: 100,
  participation_request: 100,
  like_received: 100,
  review_received: 100,
  favorite_new_ride: 200,
  support_reply: 100,
  ride_changed: 100,
  admin_review_cancellation_abuse: null,
  system: null,
};

export function getHourlyLimit(category: NotificationCategory): number | null {
  return NOTIFICATION_HOURLY_LIMITS[category];
}
