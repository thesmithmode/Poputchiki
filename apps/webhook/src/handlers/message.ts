import type { TelegramMessage } from "../types/telegram";

export async function handleMessage(
  botToken: string,
  domain: string | undefined,
  message: TelegramMessage,
): Promise<void> {
  const text = message.text?.trim() ?? "";
  if (!text.startsWith("/start") && !text.startsWith("/help")) return;
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
