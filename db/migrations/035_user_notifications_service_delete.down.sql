DROP POLICY IF EXISTS notif_service_delete ON user_notifications;
REVOKE DELETE ON user_notifications FROM poputchiki_service;
