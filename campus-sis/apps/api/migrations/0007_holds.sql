-- ============================================================================
-- 0007 — Student holds (negative service indicators) + registration gating
-- ----------------------------------------------------------------------------
-- A hold blocks a student from an action (first: course registration) until
-- it is lifted. Two sources:
--   * MANUAL holds live here in `student_hold` — placed by staff (library fine,
--     disciplinary, medical/immunisation, documents outstanding, …), each row
--     carrying its own `blocks_registration` flag so an informational hold can
--     exist without gating.
--   * The FINANCIAL hold is NOT stored. It is derived at check time from the
--     student's ledger balance vs. a tenant-configured threshold
--     (config: finance.registration_hold_threshold_minor). Deriving it keeps
--     the append-only ledger (0006) the single source of truth for money — a
--     payment lifts the hold automatically, with no row to drift out of sync.
-- Tenant-owned, RLS-enforced. See docs/02 (service indicators) and docs/10.
-- ============================================================================

CREATE TYPE hold_type AS ENUM (
  'financial',
  'library',
  'disciplinary',
  'medical',
  'academic',
  'documents',
  'other'
);
CREATE TYPE hold_status AS ENUM ('active', 'lifted');

CREATE TABLE student_hold (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  student_id      uuid NOT NULL REFERENCES student(id),
  type            hold_type NOT NULL DEFAULT 'other',
  reason          text NOT NULL,
  status          hold_status NOT NULL DEFAULT 'active',
  -- Whether this hold gates course registration. Default true; set false for an
  -- informational / warn-only indicator.
  blocks_registration boolean NOT NULL DEFAULT true,
  placed_by       uuid,
  placed_at       timestamptz NOT NULL DEFAULT now(),
  lifted_by       uuid,
  lifted_at       timestamptz,
  lift_reason     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  version         integer NOT NULL DEFAULT 1
);
-- Fast lookup of a student's active holds (the registration-gate query).
CREATE INDEX ix_student_hold_active ON student_hold (tenant_id, student_id, status);

-- ----------------------------------------------------------------------------
-- Row-Level Security — strict tenant isolation (full read/write within tenant).
-- ----------------------------------------------------------------------------
ALTER TABLE student_hold ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_hold FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON student_hold
  USING (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.is_platform', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
