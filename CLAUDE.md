# Правила проекта Poputchiki

## .gitignore — ТОЛЬКО для секретов

**Обновлено 2026-05-01** (заменяет прежний абсолютный запрет).

`.gitignore` разрешён, но **только для секретов и приватных ключей**:
- `.env`, `.env.local`, `.env.*.local`
- `*.pem`, `*.key`, `secrets/`

**Всё остальное коммитится** — `node_modules/`, артефакты сборки, логи, кэш, dump'ы (если не зашифрованные с секретом). Репо приватный, история нужна полная.

Если инструмент/фреймворк автоматически генерирует широкий `.gitignore` (Next.js, npm и т.п.) — **удалить сгенерированный** и оставить только наш минимальный для секретов.

## Секреты — где живут

Дублируются в двух местах (правило 2026-05-01):

1. **GitHub Secrets** (Settings → Secrets and variables → Actions) — для CI/CD и production deploy. Перезаписываются через `gh secret set <NAME> -R thesmithmode/Poputchiki` (значение через stdin, не argv).
2. **Локальный `.env`** в корне репо — для локальной разработки и Ralph-цикла. Файл в `.gitignore`, не пушится. Шаблон без значений лежит в `.env.example` (коммитится).

Список текущих секретов: `BOT_TOKEN`, `ADMIN_TG_ID`, `ADMIN_TG_CHAT_ID`, `POSTGRES_*`, `JWT_SECRET`, `DOMAIN` (variable). При генерации новых — `gh secret set` + дописать в `.env`.

Никогда не выводить значения секретов в чат, stdout, логи, коммит-сообщения.

## Документы продукта (источник истины)

- `docs/PRD-Poputchiki-v0.1.md` — продуктовые требования, фичи, метрики, roadmap
- `docs/SPEC-Architecture-v0.1.md` — архитектура, схема БД, RLS, тестовая стратегия, CI/CD, бэкапы
- `docs/OPEN-QUESTIONS-v0.1.md` — слепые зоны и вопросы заказчику; решения попадают сюда до фиксации в PRD

Любые архитектурные/продуктовые решения сначала обновляют эти три документа, потом код.

## Качество (ОБЯЗАТЕЛЬНО)

- TDD: тесты пишутся ПЕРЕД реализацией (red → green → refactor)
- Coverage ≥90% lines / 85% branches; CI блокирует merge при падении
- Тесты: unit (Vitest) + integration (против локальной Supabase) + E2E (Playwright + TG WebApp mock)
- Security: RLS на каждой таблице, HMAC-проверка Telegram initData, шифрование ПД, аудит-лог, бэкапы с тестом восстановления

## Эталоны

- Telegram Mini App auth: `C:\Soft\Projects\Telegram-export-clean\src\main\java\com\tcleaner\dashboard\auth\telegram\` (HMAC + nonce + identity-guard cookie)
- Шаблон Ralph-цикла: `saas/saas-project-ralph/ralph.sh` + wishlist в `Доработать_скрипт.md`
