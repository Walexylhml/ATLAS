-- ============================================================================
-- 0004 — Academic records: students & course catalogue (Phase 1 foundation)
-- ----------------------------------------------------------------------------
-- A student is a person enrolled on a programme (→ department → faculty → school),
-- which is what finally lets authorization scope resolve for person targets.
-- A course is a department-owned catalogue item. Both tenant-owned, under the
-- same RLS discipline as 0001–0003. See docs/10.
-- ============================================================================

CREATE TYPE course_type AS ENUM ('core', 'required', 'elective', 'general_studies');
CREATE TYPE student_status AS ENUM ('active', 'deferred', 'withdrawn', 'graduated', 'suspended');

CREATE TABLE student (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  person_id        uuid NOT NULL REFERENCES person(id),
  matric_no        text,
  programme_id     uuid NOT NULL REFERENCES programme(id),
  current_level    integer NOT NULL DEFAULT 100,
  entry_session_id uuid REFERENCES academic_session(id),
  status           student_status NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  version          integer NOT NULL DEFAULT 1,
  deleted_at       timestamptz,
  CONSTRAINT uq_student_tenant_person UNIQUE (tenant_id, person_id),
  CONSTRAINT uq_student_tenant_matric UNIQUE (tenant_id, matric_no)
);
CREATE INDEX ix_student_programme ON student (programme_id);
CREATE INDEX ix_student_person ON student (tenant_id, person_id);

CREATE TABLE course (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  department_id uuid NOT NULL REFERENCES department(id),
  code          text NOT NULL,
  title         text NOT NULL,
  credit_units  integer NOT NULL DEFAULT 3,
  level         integer NOT NULL DEFAULT 100,
  semester      semester_ordinal NOT NULL,
  type          course_type NOT NULL DEFAULT 'core',
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  CONSTRAINT uq_course_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_course_department ON course (department_id);

-- ----------------------------------------------------------------------------
-- Row-Level Security — identical shape to the strict tenant-owned tables (0001).
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['student','course']
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
