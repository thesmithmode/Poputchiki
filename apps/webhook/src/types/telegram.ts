export type ChatMemberStatus =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked";

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramChatMember {
  status: ChatMemberStatus;
  user: TelegramUser;
}

export interface TelegramMyChatMember {
  chat: TelegramChat;
  from: TelegramUser;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  my_chat_member?: TelegramMyChatMember;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
