import type { NotificationCategory } from "@poputchiki/shared";

/**
 * Notifier internal alias for the canonical shared category type.
 * Single source of truth — adding a category in shared automatically
 * widens this alias and forces a typecheck error anywhere the notifier
 * format/whitelist hasn't been updated.
 */
export type Category = NotificationCategory;

export interface NotifyPayload {
  user_id: string;
  category: Category;
  target_id?: string;
  message_id?: string;
  ride_id?: string;
  passenger_id?: string;
  driver_id?: string;
  [key: string]: unknown;
}

export interface Recipient {
  tg_id: number;
  notify_disabled: boolean;
  pref_enabled: boolean;
}

export type NotifStatus = "sent" | "failed" | "skipped_dup" | "skipped_disabled";

export interface NotifierDb {
  getRecipient(userId: string, category: Category): Promise<Recipient | null>;
  markNotifyDisabled(userId: string): Promise<void>;
  /** Returns true if this is a new notification (inserted), false if duplicate (skipped). */
  tryLogNotification(notificationId: string, userId: string, category: string): Promise<boolean>;
  updateNotificationStatus(notificationId: string, status: NotifStatus): Promise<void>;
}
