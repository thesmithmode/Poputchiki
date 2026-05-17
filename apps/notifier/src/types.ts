export type Category =
  | "ride_request"
  | "ride_request_accepted"
  | "ride_request_rejected"
  | "ride_request_cancelled"
  | "ride_cancelled"
  | "confirm_participation"
  | "participation_request"
  | "like_received"
  | "review_received"
  | "favorite_new_ride"
  | "support_reply"
  | "system";

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
