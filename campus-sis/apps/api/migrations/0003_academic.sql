-- ============================================================================
-- 0003 — Academic structure, calendar & grading
-- ----------------------------------------------------------------------------
-- School -> Faculty -> Department -> Programme (classic Nigerian university),
-- the session/semester calendar, and a tenant-configurable grading scheme.
-- All tenant-owned and under the SAME RLS discipline as 0001/0002.
-- See docs/10-academic-structure-and-results.md.
-- ============================================================================

-- Add 'school' as a scope level (tenant > school > faculty > department > self).
-- PG12+ allows ADD VALUE in a transaction as long as it is not USED in the same
-- transaction (it isn't here — only tables are created).
ALTER TYPE scope_type ADD VALUE IF NOT EXISTS 'school' AFTER 'tenant';

CREATE TYPE semester_ordinal AS ENUM ('first', 'second');

-- Top grouping (School/College). Optional level — a faculty may sit directly
-- under the tenant (school_id NULL).
CREATE TABLE school (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  code           text NOT NULL,
  name           text NOT NULL,
  head_person_id uuid,
  status         text NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  version        integer NOT NULL DEFAULT 1,
  deleted_at     timestamptz,
  CONSTRAINT uq_school_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE faculty (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  school_id      uuid REFERENCES school(id),
  code           text NOT NULL,
  name           text NOT NULL,
  dean_person_id uuid,
  status         text NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  version        integer NOT NULL DEFAULT 1,
  deleted_at     timestamptz,
  CONSTRAINT uq_faculty_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_faculty_school ON faculty (school_id);

CREATE TABLE department (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  faculty_id    uuid NOT NULL REFERENCES faculty(id),
  code          text NOT NULL,
  name          text NOT NULL,
  hod_person_id uuid,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  CONSTRAINT uq_department_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_department_faculty ON department (faculty_id);

CREATE TABLE programme (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  department_id  uuid NOT NULL REFERENCES department(id),
  code           text NOT NULL,
  name           text NOT NULL,
  award          text NOT NULL,
  duration_years integer NOT NULL DEFAULT 4,
  max_level      integer NOT NULL DEFAULT 400,
  status         text NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  version        integer NOT NULL DEFAULT 1,
  deleted_at     timestamptz,
  CONSTRAINT uq_programme_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_programme_department ON programme (department_id);

CREATE TABLE academic_session (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  name       text NOT NULL,
  starts_on  date,
  ends_on    date,
  is_current boolean NOT NULL DEFAULT false,
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  version    integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_session_tenant_name UNIQUE (tenant_id, name)
);

CREATE TABLE academic_semester (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES academic_session(id),
  ordinal    semester_ordinal NOT NULL,
  name       text NOT NULL,
  starts_on  date,
  ends_on    date,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  version    integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_semester_session_ordinal UNIQUE (session_id, ordinal)
);
CREATE INDEX ix_semester_session ON academic_semester (session_id);

CREATE TABLE grading_scheme (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  name       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  scale_max  numeric(3,2) NOT NULL DEFAULT 5.00,
  pass_mark  integer NOT NULL DEFAULT 40,
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  version    integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_grading_scheme_tenant_name UNIQUE (tenant_id, name)
);

CREATE TABLE grade_band (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  scheme_id   uuid NOT NULL REFERENCES grading_scheme(id),
  grade       text NOT NULL,
  min_score   integer NOT NULL,
  max_score   integer NOT NULL,
  grade_point numeric(3,2) NOT NULL,
  is_pass     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  version     integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_grade_band_scheme_grade UNIQUE (scheme_id, grade)
);
CREATE INDEX ix_grade_band_scheme ON grade_band (scheme_id);

CREATE TABLE degree_class (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  scheme_id  uuid NOT NULL REFERENCES grading_scheme(id),
  name       text NOT NULL,
  min_cgpa   numeric(3,2) NOT NULL,
  max_cgpa   numeric(3,2) NOT NULL,
  rank       integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  version    integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_degree_class_scheme_name UNIQUE (scheme_id, name)
);
CREATE INDEX ix_degree_class_scheme ON degree_class (scheme_id);

-- ----------------------------------------------------------------------------
-- Row-Level Security — identical shape to the strict tenant-owned tables (0001).
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'school','faculty','department','programme',
    'academic_session','academic_semester',
    'grading_scheme','grade_band','degree_class'
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
