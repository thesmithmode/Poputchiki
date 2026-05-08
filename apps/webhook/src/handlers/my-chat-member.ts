import type postgres from "postgres";
import type { TelegramMyChatMember } from "../types/telegram";

export async function handleMyChatMember(
  sql: postgres.Sql,
  event: TelegramMyChatMember,
): Promise<void> {
  if (event.new_chat_member.status !== "kicked") return;
  // A5: gate на private — только личные чаты (пользователь заблокировал бота)
  // chat.id в приватном чате = tg_id пользователя, не from.id (инициатор может быть другим)
  if (event.chat.type !== "private") return;
  await sql`UPDATE users SET notify_disabled = true WHERE tg_id = ${event.chat.id}`;
}
