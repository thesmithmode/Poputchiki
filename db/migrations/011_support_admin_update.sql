-- Migration 011: admin UPDATE policy for support_messages
-- Reason: admin reply endpoint UPDATE'ит status/reply_text — без явной policy
-- FORCE RLS блокирует update даже для admin role. SELECT уже разрешён через
-- support_messages_admin_read, теперь даём UPDATE.

CREATE POLICY support_messages_admin_update ON support_messages
  FOR UPDATE
  USING (app.is_admin())
  WITH CHECK (app.is_admin());
