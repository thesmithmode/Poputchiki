# Правила проекта Poputchiki

## .gitignore — ЗАПРЕЩЁН

Репо приватное. **НЕ создавать `.gitignore`** ни при каких условиях.

- Не добавлять файл `.gitignore` в репо
- Не предлагать его создать
- Не игнорировать ничего — коммитить всё (включая `node_modules/`, `.env`, артефакты сборки, логи и т.д.)
- Если инструмент/фреймворк автоматически сгенерировал `.gitignore` — удалить сразу

Причина: приватный репо, нужна полная история всех файлов проекта.

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
