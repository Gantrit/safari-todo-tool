-- ============================================================
-- 021 — Email notifications (Resend)
-- ============================================================
-- In-app notifications are created inside SECURITY DEFINER SQL functions
-- (approve_task, review_quest, assignment triggers, …), so there is no
-- JS seam to hook email into. Instead, an AFTER INSERT trigger on
-- `notifications` fires an async webhook (pg_net) to the Next.js route
-- `/api/email/notify`, which checks the user's email_enabled preference and
-- sends via Resend. Fire-and-forget: it never blocks or fails the insert.
--
-- SETUP (one-time, see SETUP.md):
--   1. Enable the pg_net extension (this file does it, or Dashboard →
--      Database → Extensions → pg_net).
--   2. Set Vercel env: RESEND_API_KEY, EMAIL_WEBHOOK_SECRET, EMAIL_FROM.
--   3. Point the DB at the app + share the secret (run once, your values):
--        UPDATE email_webhook_config
--        SET app_url = 'https://safari-todo-tool.vercel.app',
--            webhook_secret = '<same value as EMAIL_WEBHOOK_SECRET>';
--   Until app_url is set, the trigger is a no-op — nothing breaks.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Single-row config: where to POST + the shared secret the route verifies.
CREATE TABLE IF NOT EXISTS email_webhook_config (
  id             BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  app_url        TEXT,
  webhook_secret TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO email_webhook_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE email_webhook_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_webhook_config_admin" ON email_webhook_config;
CREATE POLICY "email_webhook_config_admin" ON email_webhook_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION notify_email_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT app_url, webhook_secret INTO v_url, v_secret
  FROM email_webhook_config WHERE id = TRUE;

  -- Not configured yet → do nothing, never block the notification write.
  IF v_url IS NULL OR v_url = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url || '/api/email/notify',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', COALESCE(v_secret, '')
      ),
      body    := jsonb_build_object('notification_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- email plumbing must never break the app
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_email ON notifications;
CREATE TRIGGER trg_notify_email
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_email_on_notification();
