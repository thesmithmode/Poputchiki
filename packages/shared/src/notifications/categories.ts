/**
 * Canonical notification category catalog. Single source of truth shared
 * across api (enqueue), notifier (whitelist + format), web (feed labels +
 * preferences UI). Drift across these surfaces is what made events appear
 * as "always new" — adding entries here without updating consumers will
 * surface as a typecheck failure.
 */

export const NOTIFICATION_CATEGORIES = [
  "ride_request",
  "ride_request_accepted",
  "ride_request_rejected",
  "ride_request_cancelled",
  "ride_cancelled",
  "confirm_participation",
  "participation_request",
  "like_received",
  "review_received",
  "favorite_new_ride",
  "support_reply",
  "ride_changed",
  "admin_review_cancellation_abuse",
  "system",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * User-toggleable categories shown in NotificationPreferencesScreen.
 * Internal/admin categories (admin_*, ride_changed, system) are always-on
 * — they bypass the preference check on the notifier side.
 */
export const USER_TOGGLEABLE_CATEGORIES = [
  "ride_request",
  "ride_request_accepted",
  "ride_request_rejected",
  "ride_request_cancelled",
  "ride_cancelled",
  "confirm_participation",
  "participation_request",
  "like_received",
  "review_received",
  "favorite_new_ride",
  "support_reply",
] as const;

export type UserToggleableCategory = (typeof USER_TOGGLEABLE_CATEGORIES)[number];

const TOGGLEABLE_SET = new Set<string>(USER_TOGGLEABLE_CATEGORIES);
const CATEGORY_SET = new Set<string>(NOTIFICATION_CATEGORIES);

export function isNotificationCategory(val: unknown): val is NotificationCategory {
  return typeof val === "string" && CATEGORY_SET.has(val);
}

export function isUserToggleableCategory(val: unknown): val is UserToggleableCategory {
  return typeof val === "string" && TOGGLEABLE_SET.has(val);
}
