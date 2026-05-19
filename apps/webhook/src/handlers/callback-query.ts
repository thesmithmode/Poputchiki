import type { TelegramCallbackQuery } from "../types/telegram";

const CALLBACK_RE = /^req:(accept|reject):([0-9a-f-]{36})$/i;

export interface CallbackDeps {
  botToken: string;
  apiUrl: string;
  internalSecret: string;
  fetchFn?: typeof fetch;
}

/**
 * Telegram callback_query handler для inline-кнопок Принять/Отклонить.
 *
 * Контракт: callback_data = "req:<accept|reject>:<requestId>" (см.
 * notifier/reply-markup.ts). Парсим, вызываем internal API endpoint
 * /internal/ride-requests/:id/:action с tg_id отправителя — API сам
 * резолвит user.id, проверяет авторизацию (driver of ride) и применяет
 * state machine + side effects (enqueueNotification пассажиру).
 *
 * После применения: отвечаем answerCallbackQuery со статусом, и
 * editMessageReplyMarkup убираем кнопки чтобы избежать повторных нажатий.
 *
 * Все ошибки — без throw наружу: webhook должен вернуть 200 чтобы
 * Telegram не ретраил update.
 */
export async function handleCallbackQuery(
  deps: CallbackDeps,
  query: TelegramCallbackQuery,
): Promise<void> {
  const fetchFn = deps.fetchFn ?? fetch;
  const data = query.data ?? "";
  const match = CALLBACK_RE.exec(data);
  if (!match) {
    await answer(fetchFn, deps.botToken, query.id, "Неизвестная команда");
    return;
  }
  const action = match[1] as "accept" | "reject";
  const requestId = match[2];

  let resp: Response;
  try {
    resp = await fetchFn(`${deps.apiUrl}/internal/ride-requests/${requestId}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": deps.internalSecret,
      },
      body: JSON.stringify({ tg_id: query.from.id }),
    });
  } catch {
    await answer(fetchFn, deps.botToken, query.id, "Сервис недоступен");
    return;
  }

  let userText: string;
  if (resp.ok) {
    userText = action === "accept" ? "✅ Заявка принята" : "❌ Заявка отклонена";
    if (query.message) {
      const statusLine = action === "accept" ? "\n\n✅ Принято" : "\n\n❌ Отклонено";
      const newText = (query.message.text ?? "") + statusLine;
      await editMessageText(
        fetchFn,
        deps.botToken,
        query.message.chat.id,
        query.message.message_id,
        newText,
      );
    }
  } else if (resp.status === 403) {
    userText = "Доступ запрещён — только водитель может принять/отклонить";
  } else if (resp.status === 404) {
    userText = "Заявка не найдена";
  } else if (resp.status === 409) {
    let body: { error?: string } = {};
    try {
      body = (await resp.json()) as { error?: string };
    } catch {
      // ignore json parse — fallback to generic message
    }
    userText = body.error === "no_seats" ? "Нет свободных мест" : "Заявка уже обработана";
  } else {
    userText = "Ошибка обработки";
  }

  await answer(fetchFn, deps.botToken, query.id, userText);
}

async function answer(
  fetchFn: typeof fetch,
  botToken: string,
  callbackQueryId: string,
  text: string,
): Promise<void> {
  try {
    await fetchFn(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
    });
  } catch {
    // ignore — webhook must return 200 regardless of TG API availability
  }
}

async function editMessageText(
  fetchFn: typeof fetch,
  botToken: string,
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  try {
    await fetchFn(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: { inline_keyboard: [] },
      }),
    });
  } catch {
    // ignore
  }
}
