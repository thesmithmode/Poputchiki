-- Migration 030: revoked_tokens — FORCE ROW LEVEL SECURITY.
--
-- Причина (review 2026-05-20 shared-db C2):
-- 008_revoked_tokens.sql включил RLS + RESTRICTIVE policy USING(false) для
-- роли poputchiki_app, но без FORCE. Владелец таблицы (роль, под которой шли
-- DDL миграции) обходит RLS по умолчанию. Если приложение случайно
-- законнектится под этой ролью или произойдёт SQL-injection с эскалацией —
-- deny-policy не сработает.
--
-- FORCE RLS закрывает дыру для table-owner; superuser продолжает обходить
-- (это by-design для logout/cleanup, которые используют superuser-pool —
-- см. комментарий в 008).
--
-- Соответствует конвенции проекта: все остальные prod таблицы (users, rides,
-- ride_templates, ride_requests, ride_participation, likes, reviews, favorites,
-- private_notes, complaints, audit_log, support_messages, notification_preferences,
-- error_log, nonces, rate_limit_buckets, notification_log, user_notifications)
-- уже имеют FORCE RLS — revoked_tokens был выпадающим.

ALTER TABLE revoked_tokens FORCE ROW LEVEL SECURITY;
