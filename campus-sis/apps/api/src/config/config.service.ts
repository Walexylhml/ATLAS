import { Injectable } from "@nestjs/common";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { newId } from "../common/ids.js";
import { withTenant } from "../database/rls.js";
import { config } from "../database/schema/index.js";

/**
 * Tenant configuration over the effective-dated `config` table (namespace/key →
 * JSON value). This is the "configure, don't code" surface: weighting, labels,
 * policy toggles live here as data, resolved at runtime. Setting a value closes
 * the currently-open one and opens a new effective row, so history is preserved.
 *
 * NOT to be confused with `src/config/env.ts` (process environment).
 */
@Injectable()
export class ConfigService {
  /** Current effective value for (namespace, key), or `fallback` if unset. */
  async get<T = unknown>(
    tenantId: string,
    namespace: string,
    key: string,
    fallback: T,
  ): Promise<T> {
    return withTenant({ tenantId }, async (db) => {
      const [row] = await db
        .select({ value: config.value })
        .from(config)
        .where(
          and(
            eq(config.tenantId, tenantId),
            eq(config.namespace, namespace),
            eq(config.key, key),
            lte(config.effectiveFrom, new Date()),
            or(isNull(config.effectiveTo), gt(config.effectiveTo, new Date())),
          ),
        )
        .orderBy(desc(config.effectiveFrom))
        .limit(1);
      return (row?.value as T) ?? fallback;
    });
  }

  /** Set (namespace, key), closing any currently-open value first. */
  async set(
    tenantId: string,
    namespace: string,
    key: string,
    value: unknown,
    actorId?: string,
  ): Promise<void> {
    await withTenant({ tenantId, actorId }, async (db) => {
      await db
        .update(config)
        .set({ effectiveTo: new Date() })
        .where(
          and(
            eq(config.tenantId, tenantId),
            eq(config.namespace, namespace),
            eq(config.key, key),
            isNull(config.effectiveTo),
          ),
        );
      await db.insert(config).values({
        id: newId(),
        tenantId,
        namespace,
        key,
        value: value as object,
        createdBy: actorId ?? null,
      });
    });
  }
}
