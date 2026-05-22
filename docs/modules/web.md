# web (React SPA)

Telegram Mini App. Vite + React 18 + TypeScript. Работает внутри Telegram WebView.

## Экраны

| Экран | Путь | Назначение |
|-------|------|-----------|
| OnboardingScreen | / (первый визит) | приветствие, ввод имени/фото |
| RidesScreen | /, /map | лента поездок (список) или карта — одна компонента, путь определяет вид |
| CreateRideScreen | /rides/new | форма создания поездки |
| RideDetailScreen | /rides/:id | детали, участники, чат запросов |
| ConfirmParticipationScreen | /rides/:id/confirm | водитель подтверждает участников |
| ProfileScreen | /profile/:id | профиль пользователя |
| FilterPresetsScreen | /presets | сохранённые пресеты фильтров (набор направление+цена+время) |
| EventsScreen | /events | лента событий (запросы, лайки, уведомления) |
| SettingsScreen | /settings | настройки, выход |
| NotificationPreferencesScreen | /settings/notifications | подписки на уведомления |
| SupportScreen | /support | обращение в поддержку |
| AdminScreen | /admin | модерация (только admin-роль) |
| TermsScreen / PrivacyScreen | /legal/* | юридические документы |

## API-клиент (`lib/api.ts`)

Тонкая обёртка над `fetch`. JWT хранится в httpOnly cookie — явно не передаётся.
- Автоматический retry при 401 → `POST /api/auth/refresh` → повтор запроса
- При втором 401 — выход (невалидный refresh token)

## Realtime (`hooks/useRealtime.ts`)

`EventSource` → `GET /api/realtime`. События: `ride_updated`, `request_status_changed`, `new_notification`. Reconnect с backoff при обрыве.

## Telegram SDK (`lib/telegram.ts`)

Обёртка над `window.Telegram.WebApp`:
- `tg.initData` — для auth
- `tg.MainButton`, `tg.BackButton`
- `tg.HapticFeedback`
- `tg.expand()` на старте

## Сборка

```bash
cd web && bun run build   # → web/dist/
```
`VITE_API_BASE` — URL API (подставляется в момент сборки через Docker build-arg).

## Тесты

`web/src/**/*.test.tsx` — компонентные тесты (Vitest + @testing-library/react)
