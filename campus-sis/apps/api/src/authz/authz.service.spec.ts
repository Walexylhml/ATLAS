import { evaluate, type ResolvedFacts } from "./authz.service.js";
import type { Grant } from "./permissions.js";
import type { Principal } from "./principal.js";

/**
 * Exercises the pure authorization decision (docs/02 §4.2) without any DB. The
 * async authorize() just resolves grants + facts and delegates here, so this is
 * where the model's correctness is pinned down.
 */
describe("authz evaluate()", () => {
  const principal: Principal = {
    accountId: "acct-1",
    personId: "person-self",
    tenantId: "tenant-1",
    sessionId: "session-1",
    assurance: "otp",
  };
  const noFacts: ResolvedFacts = { isConsentedChild: false };

  const grant = (over: Partial<Grant>): Grant => ({
    permissionKey: "person.read",
    scopeType: "tenant",
    scopeRefId: null,
    requiresStepUp: false,
    relationshipPredicate: null,
    ...over,
  });

  it("defaults to deny when no candidate grant matches", () => {
    expect(evaluate([], {}, principal, noFacts).allowed).toBe(false);
  });

  it("allows a tenant-scoped grant against any target", () => {
    const d = evaluate([grant({ scopeType: "tenant" })], { personId: "anyone" }, principal, noFacts);
    expect(d.allowed).toBe(true);
  });

  it("self scope allows the owner and denies others", () => {
    const g = [grant({ scopeType: "self" })];
    expect(evaluate(g, { personId: "person-self" }, principal, noFacts).allowed).toBe(true);
    const denied = evaluate(g, { personId: "someone-else" }, principal, noFacts);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/self-scoped/);
  });

  it("is_my_child predicate requires a consented link", () => {
    const g = [grant({ relationshipPredicate: "is_my_child" })];
    expect(evaluate(g, { personId: "child" }, principal, { isConsentedChild: true }).allowed).toBe(
      true,
    );
    const denied = evaluate(g, { personId: "child" }, principal, { isConsentedChild: false });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/consented guardian/);
  });

  it("enforces step-up assurance for sensitive grants", () => {
    const g = [grant({ requiresStepUp: true })];
    expect(evaluate(g, {}, principal, noFacts).allowed).toBe(false);
    const stepped = { ...principal, assurance: "step_up" };
    expect(evaluate(g, {}, stepped, noFacts).allowed).toBe(true);
  });

  it("faculty scope covers a target in that faculty and denies others", () => {
    const g = [grant({ scopeType: "faculty", scopeRefId: "fac-1" })];
    expect(evaluate(g, { facultyId: "fac-1" }, principal, noFacts).allowed).toBe(true);
    const denied = evaluate(g, { facultyId: "fac-2" }, principal, noFacts);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/does not cover/);
  });

  it("faculty scope contains a nested department/programme (ancestry resolved onto target)", () => {
    // authorize() fills facultyId from a programme/department target before evaluate().
    const g = [grant({ scopeType: "faculty", scopeRefId: "fac-1" })];
    expect(
      evaluate(g, { departmentId: "dept-9", facultyId: "fac-1" }, principal, noFacts).allowed,
    ).toBe(true);
    expect(
      evaluate(
        g,
        { programmeId: "prog-3", departmentId: "dept-9", facultyId: "fac-1" },
        principal,
        noFacts,
      ).allowed,
    ).toBe(true);
  });

  it("school scope contains everything beneath it", () => {
    const g = [grant({ scopeType: "school", scopeRefId: "sch-1" })];
    expect(
      evaluate(g, { facultyId: "fac-1", schoolId: "sch-1" }, principal, noFacts).allowed,
    ).toBe(true);
    expect(
      evaluate(g, { facultyId: "fac-9", schoolId: "sch-2" }, principal, noFacts).allowed,
    ).toBe(false);
  });

  it("department scope matches only its own department", () => {
    const g = [grant({ scopeType: "department", scopeRefId: "dept-1" })];
    expect(evaluate(g, { departmentId: "dept-1" }, principal, noFacts).allowed).toBe(true);
    expect(evaluate(g, { departmentId: "dept-2" }, principal, noFacts).allowed).toBe(false);
  });

  it("an academic-scoped grant denies a target with no placement at that level", () => {
    const d = evaluate(
      [grant({ scopeType: "faculty", scopeRefId: "fac-1" })],
      { personId: "some-person" },
      principal,
      noFacts,
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/no faculty placement|Phase 1 student records/);
  });

  it("denies predicates not yet implemented", () => {
    const d = evaluate(
      [grant({ relationshipPredicate: "is_my_advisee" })],
      { personId: "advisee" },
      principal,
      noFacts,
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/later phase/);
  });

  it("allows when any one candidate grant passes (broad wins over narrow)", () => {
    const grants = [
      grant({ scopeType: "self" }), // would deny for another person
      grant({ scopeType: "tenant" }), // covers everyone
    ];
    expect(evaluate(grants, { personId: "someone-else" }, principal, noFacts).allowed).toBe(true);
  });
});
