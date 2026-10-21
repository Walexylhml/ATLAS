/**
 * The authorization vocabulary. Permission KEYS are platform-defined and
 * versioned in the DB (permission table); these constants are the typed handles
 * the code uses so a typo becomes a compile error, not a silent allow/deny.
 *
 * The evaluation rule (docs/02-personas-and-rbac.md §4.2): an action is allowed
 * iff the caller holds a grant for the permission, the target is within that
 * grant's SCOPE, any RELATIONSHIP PREDICATE on the grant holds, the assignment
 * is currently valid, and the session meets the required ASSURANCE level.
 * Default posture is deny.
 */

export const SCOPE_TYPES = [
  "tenant",
  "school",
  "faculty",
  "department",
  "programme",
  "self",
] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export type RelationshipPredicate =
  | "is_self"
  | "is_my_child"
  | "is_my_advisee"
  | "is_my_course"
  | "is_my_faculty";

/** Predicates whose resolution needs academic structure that lands in a later phase. */
export const DEFERRED_PREDICATES: readonly RelationshipPredicate[] = [
  "is_my_advisee",
  "is_my_course",
  "is_my_faculty",
];

/** Starter permission catalogue (grows per module). Keys match the DB rows. */
export const PERMISSIONS = {
  TENANT_CONFIGURE: "tenant.configure",
  PERSON_READ: "person.read",
  PERSON_WRITE: "person.write",
  /** A guardian reading a linked (and consented) child's record. Predicate: is_my_child. */
  PERSON_READ_CHILD: "person.read.child",
  ACCOUNT_MANAGE: "account.manage",
  ROLE_ASSIGN: "role.assign",
  AUDIT_READ: "audit.read",
  /** Read academic structure, calendar and grading configuration. */
  ACADEMIC_READ: "academic.read",
  /** Create/edit academic structure (schools, faculties, departments, programmes). */
  ACADEMIC_MANAGE: "academic.manage",
  /** Read student records (scope-gated to the reader's slice). */
  STUDENT_READ: "student.read",
  /** Enrol/update student records. */
  STUDENT_MANAGE: "student.manage",
  /** Read the course catalogue. */
  COURSE_READ: "course.read",
  /** Create/edit courses in the catalogue. */
  COURSE_MANAGE: "course.manage",
  /** Create/edit course offerings (a course run in a session). */
  OFFERING_MANAGE: "offering.manage",
  /** Register/drop a student for an offering (students self-register). */
  REGISTRATION_REGISTER: "registration.register",
  /** Read a student's registrations. */
  REGISTRATION_READ: "registration.read",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** One effective, scoped grant resolved for a caller (role_assignment × permission). */
export interface Grant {
  permissionKey: string;
  scopeType: ScopeType;
  scopeRefId: string | null;
  requiresStepUp: boolean;
  relationshipPredicate: RelationshipPredicate | null;
}

/** What the caller is trying to act on. IDs are supplied by the guard from the route. */
export interface AccessTarget {
  personId?: string;
  schoolId?: string;
  facultyId?: string;
  departmentId?: string;
  programmeId?: string;
  /** A student — resolved to their programme's ancestry for scope. */
  studentId?: string;
  /** A course — resolved to its department's ancestry for scope. */
  courseId?: string;
}

export interface AuthzDecision {
  allowed: boolean;
  /** Human-readable reason — surfaced in logs and (for denials) the 403 body. */
  reason: string;
}
