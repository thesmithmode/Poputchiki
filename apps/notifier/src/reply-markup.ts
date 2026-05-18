import type { Category, NotifyPayload } from "./types.js";

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

/**
 * Build a Telegram inline_keyboard for actionable categories. Returns null
 * when the category doesn't expose driver/passenger actions or the payload
 * lacks the identifiers the webhook callback handler needs.
 *
 * UX-симметрия с in-app карточкой EventsScreen — кнопки идентичны.
 */
export function buildReplyMarkup(
  category: Category,
  payload: NotifyPayload,
): InlineKeyboardMarkup | null {
  if (category === "ride_request") {
    const requestId = payload.request_id;
    if (typeof requestId !== "string" || requestId.length === 0) return null;
    return {
      inline_keyboard: [
        [
          { text: "✅ Принять", callback_data: `req:accept:${requestId}` },
          { text: "❌ Отклонить", callback_data: `req:reject:${requestId}` },
        ],
      ],
    };
  }
  return null;
}
