-- Migration 039: harden support_messages user RLS policies.
-- Users may create and read their own support tickets, but support workflow
-- fields (status/reply_text/replied_at) are admin-controlled. The previous
-- support_messages_own policy omitted FOR, which PostgreSQL treats as FOR ALL
-- and therefore allowed user UPDATE/DELETE on owned tickets.

DROP POLICY IF EXISTS support_messages_own ON support_messages;
DROP POLICY IF EXISTS support_messages_own_select ON support_messages;
DROP POLICY IF EXISTS support_messages_own_insert ON support_messages;

CREATE POLICY support_messages_own_select ON support_messages
  FOR SELECT
  USING (user_id = app.current_user_id());

CREATE POLICY support_messages_own_insert ON support_messages
  FOR INSERT
  WITH CHECK (user_id = app.current_user_id());
