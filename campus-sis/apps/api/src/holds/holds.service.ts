import { Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { ConfigService } from "../config/config.service.js";
import { type TxDb, withTenant } from "../database/rls.js";
import { ledgerEntry, student, studentHold } from "../database/schema/index.js";

/** Config namespace/key for the registration financial-hold threshold (minor units). */
export const FINANCE_NS = "finance";
export const HOLD_THRESHOLD_KEY = "registration_hold_threshold_minor";
/** Default: any outstanding balance blocks registration (full payment required). */
export const DEFAULT_HOLD_THRESHOLD_MINOR = 0;

export type HoldType =
  | "financial"
  | "library"
  | "disciplinary"
  | "medical"
  | "academic"
  | "documents"
  | "other";

/** A hold as seen by the gate — a stored manual row, or the derived financial one. */
export interface EffectiveHold {
  type: HoldType;
  reason: string;
  blocksRegistration: boolean;
  /** true = derived from the ledger, not a stored row. */
  auto: boolean;
  holdId?: string;
  balanceMinor?: number;
  thresholdMinor?: number;
}

/**
 * Derive the financial hold from a ledger balance. Returns a synthetic
 * (unstored) hold when the outstanding balance exceeds the tenant threshold,
 * else null. Pure — unit-tested without a database.
 */
export function deriveFinancialHold(
  balanceMinor: number,
  thresholdMinor: number,
): EffectiveHold | null {
  if (balanceMinor <= thresholdMinor) return null;
  return {
    type: "financial",
    reason: `Outstanding balance exceeds the registration threshold`,
    blocksRegistration: true,
    auto: true,
    balanceMinor,
    thresholdMinor,
  };
}

/** The subset of holds that actually block registration. Pure. */
export function blockingHolds(holds: EffectiveHold[]): EffectiveHold[] {
  return holds.filter((h) => h.blocksRegistration);
}

export interface PlaceHoldInput {
  type: HoldType;
  reason: string;
  blocksRegistration?: boolean;
}

/**
 * Student holds (negative service indicators) and the registration gate's
 * source of truth. Manual holds are stored rows; the financial hold is derived
 * from the ledger so it can never drift from the money.
 */
@Injectable()
export class HoldsService {
  constructor(private readonly config: ConfigService) {}

  /** Tenant's registration financial-hold threshold in minor units. */
  financialThreshold(tenantId: string): Promise<number> {
    return this.config.get<number>(
      tenantId,
      FINANCE_NS,
      HOLD_THRESHOLD_KEY,
      DEFAULT_HOLD_THRESHOLD_MINOR,
    );
  }

  /**
   * Resolve a student's effective holds within an existing transaction: active
   * manual holds plus the derived financial hold. Used by the registration gate
   * so the check shares the caller's transaction (no extra round-trip, no race).
   */
  async effectiveHolds(
    db: TxDb,
    tenantId: string,
    studentId: string,
    thresholdMinor: number,
  ): Promise<EffectiveHold[]> {
    const manual = await db
      .select()
      .from(studentHold)
      .where(
        and(
          eq(studentHold.tenantId, tenantId),
          eq(studentHold.studentId, studentId),
          eq(studentHold.status, "active"),
        ),
      )
      .orderBy(desc(studentHold.placedAt));

    const holds: EffectiveHold[] = manual.map((h) => ({
      type: h.type as HoldType,
      reason: h.reason,
      blocksRegistration: h.blocksRegistration,
      auto: false,
      holdId: h.id,
    }));

    const [sums] = await db
      .select({ balance: sql<number>`COALESCE(SUM(${ledgerEntry.amountMinor}), 0)::bigint` })
      .from(ledgerEntry)
      .where(and(eq(ledgerEntry.tenantId, tenantId), eq(ledgerEntry.studentId, studentId)));
    const balanceMinor = Number(sums?.balance ?? 0);

    const financial = deriveFinancialHold(balanceMinor, thresholdMinor);
    if (financial) holds.unshift(financial);
    return holds;
  }

  /** Effective holds for a student, opening its own transaction (API read). */
  async listEffective(tenantId: string, studentId: string) {
    const thresholdMinor = await this.financialThreshold(tenantId);
    return withTenant({ tenantId }, async (db) => {
      const holds = await this.effectiveHolds(db, tenantId, studentId, thresholdMinor);
      return { holds, blocked: blockingHolds(holds).length > 0, thresholdMinor };
    });
  }

  /** Full manual-hold history for a student (active + lifted), for audit/UI. */
  listManual(tenantId: string, studentId: string) {
    return withTenant({ tenantId }, (db) =>
      db
        .select()
        .from(studentHold)
        .where(and(eq(studentHold.tenantId, tenantId), eq(studentHold.studentId, studentId)))
        .orderBy(desc(studentHold.placedAt)),
    );
  }

  /** Place a manual hold on a student. */
  async place(tenantId: string, actorId: string, studentId: string, input: PlaceHoldInput) {
    return withTenant({ tenantId, actorId }, async (db) => {
      const [stu] = await db
        .select({ id: student.id })
        .from(student)
        .where(and(eq(student.tenantId, tenantId), eq(student.id, studentId)))
        .limit(1);
      if (!stu) throw new NotFoundException("Student not found");

      const [row] = await db
        .insert(studentHold)
        .values({
          id: newId(),
          tenantId,
          studentId,
          type: input.type,
          reason: input.reason,
          blocksRegistration: input.blocksRegistration ?? true,
          placedBy: actorId,
          createdBy: actorId,
        })
        .returning();
      return row;
    });
  }

  /** Lift an active manual hold. Idempotent-safe: a lifted hold 404s. */
  async lift(
    tenantId: string,
    actorId: string,
    studentId: string,
    holdId: string,
    reason?: string,
  ) {
    return withTenant({ tenantId, actorId }, async (db) => {
      const [row] = await db
        .update(studentHold)
        .set({
          status: "lifted",
          liftedBy: actorId,
          liftedAt: new Date(),
          liftReason: reason ?? null,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(
          and(
            eq(studentHold.tenantId, tenantId),
            eq(studentHold.id, holdId),
            eq(studentHold.studentId, studentId),
            eq(studentHold.status, "active"),
          ),
        )
        .returning();
      if (!row) throw new NotFoundException("Active hold not found");
      return row;
    });
  }
}
