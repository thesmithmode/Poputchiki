import type postgres from "postgres";
import type { TelegramMessage } from "../types/telegram";

/**
 * Handle text messages — currently only /start and /help trigger replies.
 *
 * Side-effect on /start: clear `notify_disabled` for sender's tg_id.
 * Reasoning: user pressing /start in private chat with bot proves they
 * unblocked it (Telegram delivers /start only to non-blocked bots).
 * The `my_chat_member` unblock event is unreliable in practice — /start
 * serves as a robust fallback so notifier resumes pushing.
 *
 * DB errors are swallowed: webhook must return 200 to Telegram regardless,
 * otherwise TG retries the update and amplifies the failure.
 */
export async function handleMessage(
  sql: postgres.Sql,
  botToken: string,
  domain: string | undefined,
  message: TelegramMessage,
): Promise<void> {
  const text = message.text?.trim() ?? "";
  const isStart = text.startsWith("/start");
  const isHelp = text.startsWith("/help");
  if (!isStart && !isHelp) return;

  if (isStart && message.chat.type === "private") {
    try {
      // REL-03: webhook не имеет GUC — эскалируем до poputchiki_service чтобы
      // RLS-policy users_service_update разрешила UPDATE. Без SET LOCAL ROLE
      // тихий 0-row update — notify_disabled никогда не снимался при /start unblock.
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_service`;
        await tx`UPDATE users SET notify_disabled = false WHERE tg_id = ${message.chat.id}`;
      });
    } catch {
      // DB failure must not break webhook ACK; my_chat_member fallback still covers re-block
    }
  }

  if (!domain) return; // can't send useful link without domain
  const miniAppUrl = `https://app.${domain}`;
  const replyText = `Добро пожаловать в Попутчики!\n\nОткройте приложение: ${miniAppUrl}`;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: message.chat.id, text: replyText }),
    });
  } catch {
    // Telegram API unavailable — log suppressed, webhook must still return 200
  }
}
