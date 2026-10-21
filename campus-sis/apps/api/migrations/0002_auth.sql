-- ============================================================================
-- 0002 — Auth: OTP challenges + sessions
-- ----------------------------------------------------------------------------
-- Phone-first OTP login and revocable, rotating refresh sessions. Both tables
-- are tenant-owned and go under the SAME RLS discipline as 0001: a row is
-- visible/writable only within its own tenant (or from platform context).
-- The app sets app.current_tenant / app.is_platform per transaction (see rls.ts).
-- ============================================================================

CREATE TYPE otp_channel AS ENUM ('sms', 'email');
CREATE TYPE otp_purpose AS ENUM ('login', 'step_up', 'enrol');

CREATE TABLE otp_challenge (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  user_account_id uuid REFERENCES user_account(id),
  channel         otp_channel NOT NULL,
  destination     text NOT NULL,
  code_hash       text NOT NULL,
  purpose         otp_purpose NOT NULL DEFAULT 'login',
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 5,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- Hot path: "latest live challenge for this destination+purpose in this tenant".
CREATE INDEX ix_otp_challenge_lookup
  ON otp_challenge (tenant_id, destination, purpose, created_at DESC);

CREATE TABLE auth_session (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  user_account_id    uuid NOT NULL REFERENCES user_account(id),
  refresh_token_hash text NOT NULL,
  assurance_level    text NOT NULL DEFAULT 'otp',
  ip                 inet,
  user_agent         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  CONSTRAINT uq_auth_session_refresh_hash UNIQUE (refresh_token_hash)
);
CREATE INDEX ix_auth_session_account ON auth_session (tenant_id, user_account_id);

-- ----------------------------------------------------------------------------
-- Row-Level Security — identical shape to the strict tenant-owned tables in 0001.
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['otp_challenge','auth_session']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (
          current_setting('app.is_platform', true) = 'on'
          OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        )
        WITH CHECK (
          current_setting('app.is_platform', true) = 'on'
          OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        );
    $f$, t);
  END LOOP;
END $$;
