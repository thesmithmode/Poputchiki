export type Category =
  | "ride_request"
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

export interface NotifierDb {
  getRecipient(userId: string, category: Category): Promise<Recipient | null>;
  markNotifyDisabled(userId: string): Promise<void>;
}
