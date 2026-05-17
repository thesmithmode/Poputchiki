import type { Category, NotifyPayload } from "./types.js";

export function formatMessage(category: Category, payload: NotifyPayload): string {
  switch (category) {
    case "ride_request":
      return "У вас новая заявка на поездку";
    case "ride_request_accepted":
      return "Водитель принял вашу заявку на поездку!";
    case "ride_request_rejected":
      return "Водитель отклонил вашу заявку на поездку";
    case "ride_request_cancelled":
      return "Пассажир отменил заявку на поездку";
    case "ride_cancelled":
      return "Поездка была отменена";
    case "confirm_participation":
      return "Водитель подтвердил вашу поездку";
    case "participation_request":
      return "Пассажир принят на поездку";
    case "like_received":
      return "Вам поставили лайк";
    case "review_received":
      return "Вы получили новый отзыв";
    case "favorite_new_ride":
      return "Избранный пользователь добавил новую поездку";
    case "support_reply":
      return payload.message_id
        ? `Получен ответ на обращение #${payload.message_id}`
        : "Получен ответ от поддержки";
    case "system":
      return "Системное уведомление";
    /* c8 ignore next 4 -- exhaustive guard, runtime unreachable with correct types */
    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      return "У вас новое уведомление";
    }
  }
}
