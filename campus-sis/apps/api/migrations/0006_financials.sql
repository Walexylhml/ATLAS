-- ============================================================================
-- 0006 — Student financials: fees, invoices, append-only ledger, payments
-- ----------------------------------------------------------------------------
-- Ledger-first and correctness-critical. Amounts are integer MINOR units (kobo).
-- The ledger is append-only (SELECT/INSERT policies only, no UPDATE/DELETE), so
-- under FORCE RLS entries are immutable once written. All tenant-owned.
-- See docs/10 and ADR-0004 (Flutterwave).
-- ============================================================================

CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'part_paid', 'paid', 'void');
CREATE TYPE ledger_entry_type AS ENUM ('charge', 'payment', 'adjustment', 'reversal', 'waiver');
CREATE TYPE payment_status AS ENUM ('pending', 'successful', 'failed', 'reversed');
CREATE TYPE payment_provider AS ENUM ('flutterwave', 'manual');

CREATE TABLE fee_structure (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  name         text NOT NULL,
  session_id   uuid NOT NULL REFERENCES academic_session(id),
  programme_id uuid REFERENCES programme(id),
  level        integer,
  currency     text NOT NULL DEFAULT 'NGN',
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  version      integer NOT NULL DEFAULT 1,
  deleted_at   timestamptz,
  CONSTRAINT uq_fee_structure_tenant_name UNIQUE (tenant_id, name)
);

CREATE TABLE fee_item (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  fee_structure_id uuid NOT NULL REFERENCES fee_structure(id),
  name             text NOT NULL,
  amount_minor     bigint NOT NULL,
  mandatory        text NOT NULL DEFAULT 'true',
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  version          integer NOT NULL DEFAULT 1
);
CREATE INDEX ix_fee_item_structure ON fee_item (fee_structure_id);

CREATE TABLE invoice (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  student_id       uuid NOT NULL REFERENCES student(id),
  session_id       uuid NOT NULL REFERENCES academic_session(id),
  fee_structure_id uuid REFERENCES fee_structure(id),
  status           invoice_status NOT NULL DEFAULT 'draft',
  currency         text NOT NULL DEFAULT 'NGN',
  total_minor      bigint NOT NULL DEFAULT 0,
  balance_minor    bigint NOT NULL DEFAULT 0,
  issued_at        timestamptz,
  due_at           timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  version          integer NOT NULL DEFAULT 1,
  deleted_at       timestamptz
);
CREATE INDEX ix_invoice_student ON invoice (tenant_id, student_id);

CREATE TABLE invoice_line (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  invoice_id   uuid NOT NULL REFERENCES invoice(id),
  description  text NOT NULL,
  amount_minor bigint NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  version      integer NOT NULL DEFAULT 1
);
CREATE INDEX ix_invoice_line_invoice ON invoice_line (invoice_id);

-- Append-only money ledger — the system of record.
CREATE TABLE ledger_entry (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  student_id   uuid NOT NULL REFERENCES student(id),
  invoice_id   uuid REFERENCES invoice(id),
  payment_id   uuid,
  type         ledger_entry_type NOT NULL,
  amount_minor bigint NOT NULL,
  currency     text NOT NULL DEFAULT 'NGN',
  memo         text,
  reference    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid
);
CREATE INDEX ix_ledger_student ON ledger_entry (tenant_id, student_id);
CREATE INDEX ix_ledger_invoice ON ledger_entry (invoice_id);

CREATE TABLE payment (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  student_id   uuid NOT NULL REFERENCES student(id),
  invoice_id   uuid REFERENCES invoice(id),
  provider     payment_provider NOT NULL DEFAULT 'flutterwave',
  provider_ref text NOT NULL,
  amount_minor bigint NOT NULL,
  currency     text NOT NULL DEFAULT 'NGN',
  status       payment_status NOT NULL DEFAULT 'pending',
  raw_payload  jsonb,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  version      integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_payment_tenant_provider_ref UNIQUE (tenant_id, provider_ref)
);
CREATE INDEX ix_payment_student ON payment (tenant_id, student_id);

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
-- Strict tenant-owned tables (full read/write within tenant).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_structure','fee_item','invoice','invoice_line','payment']
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

-- Ledger: append-only. SELECT + INSERT within tenant; no UPDATE/DELETE policy, so
-- (under FORCE RLS) entries are immutable once written.
ALTER TABLE ledger_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_read ON ledger_entry
  FOR SELECT
  USING (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
CREATE POLICY ledger_insert ON ledger_entry
  FOR INSERT
  WITH CHECK (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
