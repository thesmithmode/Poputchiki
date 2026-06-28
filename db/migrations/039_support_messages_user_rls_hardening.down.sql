DROP POLICY IF EXISTS support_messages_own_insert ON support_messages;
DROP POLICY IF EXISTS support_messages_own_select ON support_messages;

CREATE POLICY support_messages_own ON support_messages
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());
