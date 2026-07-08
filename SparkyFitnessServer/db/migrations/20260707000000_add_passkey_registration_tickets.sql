-- Migration: passkey_registration_tickets
-- Short-lived (~60s), single-use tickets that let the mobile app hand a passkey
-- registration session to the in-browser WebAuthn page WITHOUT putting the raw
-- session token in a URL. The app mints a ticket from a fresh session; the
-- browser page redeems it once to obtain the session for the registration
-- ceremony. Rows are system-managed only (accessed via getSystemClient) and are
-- never exposed to normal user-scoped queries.

CREATE TABLE IF NOT EXISTS public.passkey_registration_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_hash   text NOT NULL UNIQUE,          -- SHA-256 (hex) of the opaque code; raw code is never stored
  user_id       uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  session_token text NOT NULL,                 -- session handed to the browser on redeem (transient)
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,                   -- non-null once redeemed (single-use)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_passkey_reg_tickets_expires_at
  ON public.passkey_registration_tickets (expires_at);
