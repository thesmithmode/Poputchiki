import type { Category, NotifyPayload } from "./types.js";

export function formatMessage(category: Category, payload: NotifyPayload): string {
  switch (category) {
    case "ride_request":
      return payload.passenger_name
        ? `${payload.passenger_name} хочет поехать с вами`
        : "У вас новая заявка на поездку";
    case "ride_request_accepted":
      return payload.driver_name
        ? `${payload.driver_name} принял вашу заявку!`
        : "Водитель принял вашу заявку на поездку!";
    case "ride_request_rejected":
      return payload.driver_name
        ? `${payload.driver_name} отклонил вашу заявку`
        : "Водитель отклонил вашу заявку на поездку";
    case "ride_request_cancelled":
      return payload.passenger_name
        ? `${payload.passenger_name} отменил заявку на поездку`
        : "Пассажир отменил заявку на поездку";
    case "ride_cancelled":
      return "Поездка была отменена";
    case "ride_completed":
      return "Ваша поездка завершена";
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
    case "ride_changed":
      return "Параметры поездки изменены";
    case "template_subscription_request":
      return payload.passenger_name
        ? `${payload.passenger_name} хочет ездить с вами регулярно`
        : "Пассажир хочет ездить с вами регулярно";
    case "template_subscription_accepted":
      return "Водитель принял вашу заявку на регулярные поездки!";
    case "template_subscription_rejected":
      return "Водитель отклонил заявку на регулярные поездки";
    case "template_subscription_revoked":
      return "Водитель отменил вашу подписку на маршрут";
    case "admin_review_cancellation_abuse":
      return "Пользователь отменил >3 поездок за сутки — требуется проверка";
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
