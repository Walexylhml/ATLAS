-- ============================================================================
-- ATLAS — Phase 0 foundation schema
-- Platform + Identity + RBAC + cross-cutting (audit, outbox, config, document)
--
-- Tenant isolation is enforced here, at the database layer, with Row-Level
-- Security (RLS). Every tenant-owned table has RLS ENABLED and FORCED, so even
-- the table owner is subject to it — no application bug can leak across tenants.
--
-- Per-request the app sets, inside a transaction:
--   SET LOCAL app.current_tenant = '<tenant uuid>';
--   SET LOCAL app.actor_id       = '<actor uuid>';
--   SET LOCAL app.is_platform    = 'on'|'off';
-- Platform context (is_platform = 'on') can cross tenants for provisioning/ops.
-- ============================================================================

-- ---- Enums -----------------------------------------------------------------
CREATE TYPE tenant_type AS ENUM ('university', 'polytechnic', 'college_of_education');
CREATE TYPE tenant_status AS ENUM ('onboarding', 'active', 'suspended', 'offboarded');
CREATE TYPE platform_role AS ENUM ('super_admin', 'ops', 'support', 'billing', 'compliance', 'onboarding');
CREATE TYPE person_status AS ENUM ('active', 'inactive', 'merged');
CREATE TYPE account_status AS ENUM ('invited', 'active', 'locked', 'disabled');
CREATE TYPE auth_method AS ENUM ('password', 'otp', 'password_otp', 'sso');
CREATE TYPE scope_type AS ENUM ('tenant', 'faculty', 'department', 'programme', 'self');
CREATE TYPE relationship_type AS ENUM ('parent', 'guardian', 'sponsor');
CREATE TYPE consent_state AS ENUM ('pending', 'granted', 'revoked');
CREATE TYPE indicator_polarity AS ENUM ('positive', 'negative');
CREATE TYPE actor_type AS ENUM ('platform', 'user', 'system');
CREATE TYPE outbox_status AS ENUM ('pending', 'dispatched', 'failed');
CREATE TYPE document_sensitivity AS ENUM ('public', 'internal', 'confidential', 'restricted');

-- ---- Platform domain (NOT tenant-scoped) -----------------------------------
CREATE TABLE plan (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  limits        jsonb NOT NULL DEFAULT '{}',
  price_minor   text,
  currency      text NOT NULL DEFAULT 'NGN',
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1
);

CREATE TABLE tenant (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  short_name    text NOT NULL,
  type          tenant_type NOT NULL,
  country       text NOT NULL DEFAULT 'NG',
  state         text,
  status        tenant_status NOT NULL DEFAULT 'onboarding',
  plan_id       uuid REFERENCES plan(id),
  data_region   text NOT NULL DEFAULT 'shared',
  branding      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_tenant_short_name ON tenant (lower(short_name));

CREATE TABLE platform_user (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'active',
  mfa_enabled   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1
);

CREATE TABLE platform_role_assignment (
  id                uuid PRIMARY KEY,
  platform_user_id  uuid NOT NULL REFERENCES platform_user(id),
  role              platform_role NOT NULL,
  effective_from    timestamptz NOT NULL DEFAULT now(),
  effective_to      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  version           integer NOT NULL DEFAULT 1
);

CREATE TABLE break_glass_grant (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  platform_user_id  uuid NOT NULL REFERENCES platform_user(id),
  reason            text NOT NULL,
  approved_by       uuid,
  consent_ref       text,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  scope             jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  version           integer NOT NULL DEFAULT 1
);

-- ---- Identity domain (tenant-scoped) ---------------------------------------
CREATE TABLE person (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  title             text,
  surname           text NOT NULL,
  first_name        text NOT NULL,
  other_names       text,
  dob               date,
  gender            text,
  nationality       text DEFAULT 'NG',
  state_of_origin   text,
  lga               text,
  marital_status    text,
  religion          text,
  disability_needs  text,
  photo_doc_id      uuid,
  primary_email     text,
  primary_phone     text,
  status            person_status NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  version           integer NOT NULL DEFAULT 1,
  deleted_at        timestamptz
);
CREATE INDEX ix_person_tenant ON person (tenant_id);

CREATE TABLE user_account (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  person_id     uuid NOT NULL REFERENCES person(id),
  username      text,
  email         text,
  phone         text,
  auth_method   auth_method NOT NULL DEFAULT 'otp',
  password_hash text,
  mfa_enabled   boolean NOT NULL DEFAULT false,
  status        account_status NOT NULL DEFAULT 'invited',
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  CONSTRAINT uq_user_account_tenant_username UNIQUE (tenant_id, username),
  CONSTRAINT uq_user_account_tenant_phone UNIQUE (tenant_id, phone)
);
CREATE INDEX ix_user_account_tenant ON user_account (tenant_id);

CREATE TABLE role (
  id            uuid PRIMARY KEY,
  tenant_id     uuid,                       -- NULL => platform role template
  key           text NOT NULL,
  name          text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_role_tenant_key UNIQUE (tenant_id, key)
);

CREATE TABLE permission (
  id                      uuid PRIMARY KEY,
  key                     text NOT NULL UNIQUE,
  resource                text NOT NULL,
  action                  text NOT NULL,
  requires_step_up        boolean NOT NULL DEFAULT false,
  relationship_predicate  text,
  catalogue_version       text NOT NULL DEFAULT '1',
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid,
  version                 integer NOT NULL DEFAULT 1
);

CREATE TABLE role_permission (
  role_id       uuid NOT NULL REFERENCES role(id),
  permission_id uuid NOT NULL REFERENCES permission(id),
  CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

CREATE TABLE role_assignment (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  user_account_id uuid NOT NULL REFERENCES user_account(id),
  role_id         uuid NOT NULL REFERENCES role(id),
  scope_type      scope_type NOT NULL DEFAULT 'tenant',
  scope_ref_id    uuid,
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_to    timestamptz,
  granted_by      uuid,
  status          text NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  version         integer NOT NULL DEFAULT 1
);
CREATE INDEX ix_role_assignment_tenant ON role_assignment (tenant_id);
CREATE INDEX ix_role_assignment_account ON role_assignment (user_account_id);

CREATE TABLE relationship (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  from_person_id      uuid NOT NULL REFERENCES person(id),
  to_person_id        uuid NOT NULL REFERENCES person(id),
  type                relationship_type NOT NULL,
  financial_scope     boolean NOT NULL DEFAULT false,
  academic_scope      boolean NOT NULL DEFAULT false,
  consent_state       consent_state NOT NULL DEFAULT 'pending',
  consent_evidence_ref text,
  effective_from      timestamptz NOT NULL DEFAULT now(),
  effective_to        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid,
  version             integer NOT NULL DEFAULT 1
);
CREATE INDEX ix_relationship_tenant ON relationship (tenant_id);

CREATE TABLE service_indicator (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  person_id     uuid NOT NULL REFERENCES person(id),
  type          text NOT NULL,
  polarity      indicator_polarity NOT NULL,
  reason        text,
  impact        jsonb NOT NULL DEFAULT '{}',
  placed_by     uuid,
  placed_at     timestamptz NOT NULL DEFAULT now(),
  released_by   uuid,
  released_at   timestamptz,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1
);
CREATE INDEX ix_service_indicator_tenant ON service_indicator (tenant_id);

-- ---- Cross-cutting ---------------------------------------------------------
CREATE TABLE audit_log (
  id              uuid PRIMARY KEY,
  tenant_id       uuid,
  actor_type      actor_type NOT NULL,
  actor_id        uuid,
  action          text NOT NULL,
  resource_type   text NOT NULL,
  resource_id     uuid,
  before          jsonb,
  after           jsonb,
  ip              text,
  user_agent      text,
  assurance_level text,
  break_glass_ref uuid,
  at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_tenant_at ON audit_log (tenant_id, at DESC);
CREATE INDEX ix_audit_resource ON audit_log (resource_type, resource_id);

CREATE TABLE event_outbox (
  id             uuid PRIMARY KEY,
  tenant_id      uuid,
  aggregate_type text NOT NULL,
  aggregate_id   uuid NOT NULL,
  event_type     text NOT NULL,
  payload        jsonb NOT NULL DEFAULT '{}',
  status         outbox_status NOT NULL DEFAULT 'pending',
  attempts       bigint NOT NULL DEFAULT 0,
  last_error     text,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  dispatched_at  timestamptz
);
-- Dispatcher hot path: find pending rows oldest-first.
CREATE INDEX ix_outbox_pending ON event_outbox (occurred_at) WHERE status = 'pending';

CREATE TABLE config (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  namespace      text NOT NULL,
  key            text NOT NULL,
  value          jsonb NOT NULL DEFAULT '{}',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  version        integer NOT NULL DEFAULT 1
);
CREATE INDEX ix_config_lookup ON config (tenant_id, namespace, key);

CREATE TABLE document (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  owner_person_id uuid,
  type            text NOT NULL,
  filename        text NOT NULL,
  storage_ref     text NOT NULL,
  content_type    text,
  size            bigint,
  checksum        text,
  sensitivity     document_sensitivity NOT NULL DEFAULT 'internal',
  uploaded_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_document_tenant ON document (tenant_id);

-- ============================================================================
-- Row-Level Security
-- ============================================================================
-- Helper expressions (inlined per policy; kept here for reference):
--   current tenant : NULLIF(current_setting('app.current_tenant', true), '')::uuid
--   platform ctx   : current_setting('app.is_platform', true) = 'on'

-- Strict tenant-owned tables: a row is visible/writable only in its own tenant,
-- or from platform context.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'person','user_account','role_assignment','relationship',
    'service_indicator','config','document'
  ]
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

-- `role`: tenant rows isolated, but NULL-tenant platform templates are readable
-- by every tenant (and writable only from platform context).
ALTER TABLE role ENABLE ROW LEVEL SECURITY;
ALTER TABLE role FORCE ROW LEVEL SECURITY;
CREATE POLICY role_read ON role
  FOR SELECT
  USING (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
CREATE POLICY role_write ON role
  FOR ALL
  USING (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

-- `audit_log` and `event_outbox` carry a nullable tenant_id. Readable within
-- tenant or platform; append-only (no UPDATE/DELETE policy => those are denied
-- under FORCE RLS even to the owner). The dispatcher runs in platform context.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_log
  FOR SELECT
  USING (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
CREATE POLICY audit_insert ON audit_log
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_rw ON event_outbox
  FOR ALL
  USING (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

-- Platform tables (plan, tenant, platform_user, platform_role_assignment,
-- break_glass_grant) are deliberately NOT under tenant RLS: access is gated by
-- platform-role checks in the application layer, not by tenant_id.
