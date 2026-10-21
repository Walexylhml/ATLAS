import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { withTenant } from "../database/rls.js";
import type { Principal } from "./principal.js";
import {
  type AccessTarget,
  type AuthzDecision,
  DEFERRED_PREDICATES,
  type Grant,
  type RelationshipPredicate,
  type ScopeType,
} from "./permissions.js";

/** Facts that need a DB lookup, resolved once before the pure evaluation runs. */
export interface ResolvedFacts {
  /** A consented guardian→target relationship exists (for is_my_child). */
  isConsentedChild: boolean;
}

@Injectable()
export class AuthzService {
  /** Can this principal perform `permission` on `target`? */
  async authorize(
    principal: Principal,
    permission: string,
    target: AccessTarget = {},
  ): Promise<AuthzDecision> {
    const grants = await this.loadGrants(principal);
    const candidates = grants.filter((g) => g.permissionKey === permission);
    if (candidates.length === 0) {
      return { allowed: false, reason: `no grant for '${permission}'` };
    }

    // A higher-level grant (school/faculty) covers units nested beneath it, so
    // enrich the target with its academic ancestry (programme→dept→faculty→school)
    // and let a simple id match at the grant's level decide containment.
    const needsAncestry = candidates.some((g) =>
      ACADEMIC_SCOPES.includes(g.scopeType),
    );
    const resolved =
      needsAncestry &&
      (target.programmeId || target.departmentId || target.facultyId || target.schoolId)
        ? await this.resolveAcademicAncestry(principal.tenantId, target)
        : target;

    // Resolve only the facts the candidate grants actually need.
    const needsChild = candidates.some((g) => g.relationshipPredicate === "is_my_child");
    const facts: ResolvedFacts = {
      isConsentedChild:
        needsChild && resolved.personId
          ? await this.hasConsentedGuardianLink(principal, resolved.personId)
          : false,
    };

    return evaluate(candidates, resolved, principal, facts);
  }

  /** Distinct permission keys the principal currently holds (for /auth/me). */
  async effectivePermissionKeys(principal: Principal): Promise<string[]> {
    const grants = await this.loadGrants(principal);
    return [...new Set(grants.map((g) => g.permissionKey))].sort();
  }

  /**
   * All currently-valid (role × permission) grants for the account, with their
   * scope and any relationship predicate. Expired, future-dated and suspended
   * assignments are filtered in SQL so they can never leak into a decision.
   */
  async loadGrants(principal: Principal): Promise<Grant[]> {
    return withTenant(
      { tenantId: principal.tenantId, actorId: principal.accountId },
      async (db) => {
        const result = await db.execute(sql`
          SELECT p.key                    AS permission_key,
                 ra.scope_type            AS scope_type,
                 ra.scope_ref_id          AS scope_ref_id,
                 p.requires_step_up       AS requires_step_up,
                 p.relationship_predicate AS relationship_predicate
          FROM role_assignment ra
          JOIN role_permission rp ON rp.role_id = ra.role_id
          JOIN permission p       ON p.id = rp.permission_id
          WHERE ra.tenant_id = ${principal.tenantId}
            AND ra.user_account_id = ${principal.accountId}
            AND ra.status = 'active'
            AND ra.effective_from <= now()
            AND (ra.effective_to IS NULL OR ra.effective_to > now())
        `);
        const rows = (result as unknown as { rows: RawGrant[] }).rows;
        return rows.map(toGrant);
      },
    );
  }

  /**
   * Fill a target's academic ancestry so containment can be decided by id match.
   * Given any one of programme/department/faculty, resolves the units above it
   * (a programme sits in a department, in a faculty, maybe in a school). A faculty
   * directly under the tenant has a null school, which simply never matches a
   * school-scoped grant.
   */
  private async resolveAcademicAncestry(
    tenantId: string,
    target: AccessTarget,
  ): Promise<AccessTarget> {
    const out: AccessTarget = { ...target };
    return withTenant({ tenantId }, async (db) => {
      const first = <T>(r: unknown): T | undefined =>
        (r as { rows: T[] }).rows[0];

      if (target.programmeId) {
        const row = first<AncestryRow>(
          await db.execute(sql`
            SELECT d.id AS department_id, f.id AS faculty_id, f.school_id AS school_id
            FROM programme p
            JOIN department d ON d.id = p.department_id
            JOIN faculty f    ON f.id = d.faculty_id
            WHERE p.id = ${target.programmeId} AND p.tenant_id = ${tenantId}
            LIMIT 1
          `),
        );
        if (row) {
          out.departmentId ??= row.department_id ?? undefined;
          out.facultyId ??= row.faculty_id ?? undefined;
          out.schoolId ??= row.school_id ?? undefined;
        }
      } else if (target.departmentId) {
        const row = first<AncestryRow>(
          await db.execute(sql`
            SELECT f.id AS faculty_id, f.school_id AS school_id
            FROM department d
            JOIN faculty f ON f.id = d.faculty_id
            WHERE d.id = ${target.departmentId} AND d.tenant_id = ${tenantId}
            LIMIT 1
          `),
        );
        if (row) {
          out.facultyId ??= row.faculty_id ?? undefined;
          out.schoolId ??= row.school_id ?? undefined;
        }
      } else if (target.facultyId) {
        const row = first<AncestryRow>(
          await db.execute(sql`
            SELECT school_id FROM faculty
            WHERE id = ${target.facultyId} AND tenant_id = ${tenantId}
            LIMIT 1
          `),
        );
        if (row) out.schoolId ??= row.school_id ?? undefined;
      }
      return out;
    });
  }

  /** Is there a granted, in-effect guardian/sponsor link from caller to target? */
  private async hasConsentedGuardianLink(
    principal: Principal,
    targetPersonId: string,
  ): Promise<boolean> {
    return withTenant({ tenantId: principal.tenantId }, async (db) => {
      const result = await db.execute(sql`
        SELECT 1
        FROM relationship r
        WHERE r.tenant_id = ${principal.tenantId}
          AND r.from_person_id = ${principal.personId}
          AND r.to_person_id = ${targetPersonId}
          AND r.type IN ('parent','guardian','sponsor')
          AND r.consent_state = 'granted'
          AND r.effective_from <= now()
          AND (r.effective_to IS NULL OR r.effective_to > now())
        LIMIT 1
      `);
      return (result as unknown as { rows: unknown[] }).rows.length > 0;
    });
  }
}

interface RawGrant {
  permission_key: string;
  scope_type: ScopeType;
  scope_ref_id: string | null;
  requires_step_up: boolean;
  relationship_predicate: RelationshipPredicate | null;
}

interface AncestryRow {
  department_id?: string | null;
  faculty_id?: string | null;
  school_id?: string | null;
}

function toGrant(r: RawGrant): Grant {
  return {
    permissionKey: r.permission_key,
    scopeType: r.scope_type,
    scopeRefId: r.scope_ref_id,
    requiresStepUp: r.requires_step_up,
    relationshipPredicate: r.relationship_predicate,
  };
}

/**
 * Pure decision over already-resolved grants + facts. No I/O — this is the
 * heart of the model and is unit-tested directly. A grant wins only if scope,
 * predicate AND assurance all pass; otherwise we keep the most specific denial
 * reason for the response.
 */
export function evaluate(
  candidates: Grant[],
  target: AccessTarget,
  principal: Principal,
  facts: ResolvedFacts,
): AuthzDecision {
  let reason = "no scoped grant matched the target";
  for (const g of candidates) {
    const scope = scopeCovers(g, target, principal);
    if (!scope.ok) {
      reason = scope.reason;
      continue;
    }
    const pred = predicateHolds(g.relationshipPredicate, target, principal, facts);
    if (!pred.ok) {
      reason = pred.reason;
      continue;
    }
    if (g.requiresStepUp && principal.assurance !== "step_up") {
      reason = "step-up (re-authentication) required for this action";
      continue;
    }
    return { allowed: true, reason: "granted" };
  }
  return { allowed: false, reason };
}

/** Academic scope levels, broadest to narrowest. A grant at one covers the levels below. */
const ACADEMIC_SCOPES: ScopeType[] = ["school", "faculty", "department", "programme"];

function scopeCovers(
  g: Grant,
  target: AccessTarget,
  principal: Principal,
): { ok: boolean; reason: string } {
  switch (g.scopeType) {
    case "tenant":
      return { ok: true, reason: "" };
    case "self":
      return target.personId === principal.personId
        ? { ok: true, reason: "" }
        : { ok: false, reason: "grant is self-scoped; target is a different person" };
    case "school":
      return matchUnit(target.schoolId, g.scopeRefId, "school");
    case "faculty":
      return matchUnit(target.facultyId, g.scopeRefId, "faculty");
    case "department":
      return matchUnit(target.departmentId, g.scopeRefId, "department");
    case "programme":
      return matchUnit(target.programmeId, g.scopeRefId, "programme");
    default:
      return { ok: false, reason: `unknown scope type '${g.scopeType}'` };
  }
}

/**
 * Containment by id: after ancestry resolution the target carries the ids of the
 * units above it, so a grant at level X is satisfied when the target's X-level id
 * equals the grant's ref. A target with no id at that level (e.g. a person with no
 * academic placement yet) is not covered — that resolution lands with Phase 1.
 */
function matchUnit(
  targetUnitId: string | undefined,
  scopeRefId: string | null,
  level: string,
): { ok: boolean; reason: string } {
  if (!targetUnitId) {
    return {
      ok: false,
      reason: `${level}-scoped grant cannot resolve this target (no ${level} placement; person-level academic scope lands with Phase 1 student records)`,
    };
  }
  return targetUnitId === scopeRefId
    ? { ok: true, reason: "" }
    : { ok: false, reason: `${level}-scoped grant does not cover this target` };
}

function predicateHolds(
  predicate: RelationshipPredicate | null,
  target: AccessTarget,
  principal: Principal,
  facts: ResolvedFacts,
): { ok: boolean; reason: string } {
  if (!predicate) return { ok: true, reason: "" };
  switch (predicate) {
    case "is_self":
      return target.personId === principal.personId
        ? { ok: true, reason: "" }
        : { ok: false, reason: "predicate is_self not satisfied" };
    case "is_my_child":
      return facts.isConsentedChild
        ? { ok: true, reason: "" }
        : { ok: false, reason: "no consented guardian relationship to the target" };
    default:
      if (DEFERRED_PREDICATES.includes(predicate)) {
        return { ok: false, reason: `predicate '${predicate}' is implemented in a later phase` };
      }
      return { ok: false, reason: `unknown predicate '${predicate}'` };
  }
}
