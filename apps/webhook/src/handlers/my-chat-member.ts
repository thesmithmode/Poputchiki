import type postgres from "postgres";
import type { TelegramMyChatMember } from "../types/telegram";

export async function handleMyChatMember(sql: postgres.Sql, event: TelegramMyChatMember): Promise<void> {
  if (event.new_chat_member.status !== "kicked") return;
  await sql`UPDATE users SET notify_disabled = true WHERE tg_id = ${event.from.id}`;
}
