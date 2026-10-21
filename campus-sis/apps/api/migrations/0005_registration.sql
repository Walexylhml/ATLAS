-- ============================================================================
-- 0005 — Course registration: offerings & registrations (Phase 1)
-- ----------------------------------------------------------------------------
-- A course_offering is a run of a course in a session+semester; a
-- course_registration links a student to an offering. Tenant-owned, under the
-- same RLS discipline as 0001–0004. See docs/10.
-- ============================================================================

CREATE TYPE offering_status AS ENUM ('open', 'closed');
CREATE TYPE registration_status AS ENUM ('registered', 'dropped', 'approved');

CREATE TABLE course_offering (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  course_id          uuid NOT NULL REFERENCES course(id),
  session_id         uuid NOT NULL REFERENCES academic_session(id),
  semester           semester_ordinal NOT NULL,
  status             offering_status NOT NULL DEFAULT 'open',
  capacity           integer,
  lecturer_person_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid,
  version            integer NOT NULL DEFAULT 1,
  deleted_at         timestamptz,
  CONSTRAINT uq_offering_course_session_semester UNIQUE (course_id, session_id, semester)
);
CREATE INDEX ix_offering_session ON course_offering (tenant_id, session_id, semester);
CREATE INDEX ix_offering_course ON course_offering (course_id);

CREATE TABLE course_registration (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  student_id    uuid NOT NULL REFERENCES student(id),
  offering_id   uuid NOT NULL REFERENCES course_offering(id),
  status        registration_status NOT NULL DEFAULT 'registered',
  registered_at timestamptz NOT NULL DEFAULT now(),
  dropped_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  version       integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_registration_student_offering UNIQUE (student_id, offering_id)
);
CREATE INDEX ix_registration_student ON course_registration (tenant_id, student_id);
CREATE INDEX ix_registration_offering ON course_registration (offering_id);

-- ----------------------------------------------------------------------------
-- Row-Level Security — identical shape to the strict tenant-owned tables (0001).
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['course_offering','course_registration']
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
