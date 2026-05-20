import type postgres from "postgres";
import type { TelegramMyChatMember } from "../types/telegram";

export async function handleMyChatMember(
  sql: postgres.Sql,
  event: TelegramMyChatMember,
): Promise<void> {
  // A5: gate на private — только личные чаты (chat.id = tg_id пользователя)
  if (event.chat.type !== "private") return;

  const status = event.new_chat_member.status;
  // H2: обработка обоих переходов — block (kicked) и unblock (member).
  // Telegram шлёт my_chat_member и при разблокировке через настройки (без /start).
  // Без unblock-ветки notify_disabled остаётся true даже после разблокировки.
  let nextDisabled: boolean;
  if (status === "kicked") nextDisabled = true;
  else if (status === "member") nextDisabled = false;
  else return;

  // REL-03: webhook не имеет GUC — эскалируем до poputchiki_service чтобы
  // RLS-policy users_service_update разрешила UPDATE.
  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_service`;
    await tx`UPDATE users SET notify_disabled = ${nextDisabled} WHERE tg_id = ${event.chat.id}`;
  });
}
