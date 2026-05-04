import type { TelegramMessage } from "../types/telegram";

export async function handleMessage(
  botToken: string,
  domain: string | undefined,
  message: TelegramMessage,
): Promise<void> {
  const text = message.text?.trim() ?? "";
  if (!text.startsWith("/start") && !text.startsWith("/help")) return;
  const miniAppUrl = domain ? `https://app.${domain}` : "https://t.me/YourBot/app";
  const replyText = `Добро пожаловать в Попутчики!\n\nОткройте приложение: ${miniAppUrl}`;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: message.chat.id, text: replyText }),
  });
}
