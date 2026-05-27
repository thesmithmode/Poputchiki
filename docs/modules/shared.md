# packages/shared

Общие Zod-схемы и TypeScript-типы. Используется и в `apps/api` (валидация входящих данных) и в `web` (типизация ответов API).

## Экспортируемые схемы

| Схема | Описание |
|-------|---------|
| `UserDTO` | публичный профиль пользователя |
| `UserProfileInput` | данные для обновления профиля |
| `RideDTO` | полное представление поездки |
| `RideStatus` | enum: pending / active / completed / cancelled |
| `CreateRideInput` | форма создания поездки |
| `MarkParticipantsInput` | подтверждение участников водителем |
| `LikeDTO` | лайк |
| `CreateReviewInput` | форма отзыва |
| `ReviewDTO` | отзыв с авторством |
| `ComplaintInput` | жалоба на пользователя |
| `SupportMessageInput` | обращение в поддержку |

## Правило

Любое изменение контракта API → сначала в shared-схему, затем в роутер API, затем в компоненты/хуки фронта. Zod-схемы — единственный источник истины.

## env.ts

`parseApiEnv`, `parseWebhookEnv`, `parseCronEnv`, `parseNotifierEnv` — парсят и валидируют переменные окружения для каждого сервиса через Zod. Падают при старте если обязательная переменная отсутствует.
