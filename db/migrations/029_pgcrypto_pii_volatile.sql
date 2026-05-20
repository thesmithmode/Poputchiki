-- Migration 029: пометить app.encrypt_pii / app.decrypt_user_pii как VOLATILE.
--
-- Причина (review 2026-05-20 shared-db C1):
-- pgp_sym_encrypt недетерминирована — каждый вызов генерирует свежий IV, чтобы
-- два шифрования одного plaintext давали разные ciphertext (IND-CPA защита).
-- STABLE сигнализирует planner-у, что результат функции не меняется в пределах
-- одного statement при тех же аргументах — это позволяет кешировать вывод и
-- разделять его между вызовами, ломая IND-CPA.
--
-- Также обе функции читают current_setting('pgcrypto.key') — session GUC,
-- значение которого может меняться через set_config; VOLATILE корректнее
-- описывает зависимость от внешнего состояния, не выраженного в аргументах.
--
-- ALTER FUNCTION ... VOLATILE — DDL, идемпотентен.

ALTER FUNCTION app.encrypt_pii(text) VOLATILE;
ALTER FUNCTION app.decrypt_user_pii(uuid) VOLATILE;
