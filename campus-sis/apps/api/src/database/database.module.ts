import { Global, Module } from "@nestjs/common";
import { Pool } from "pg";
import { createDb, getPool, type Database } from "./pool.js";

export const PG_POOL = Symbol("PG_POOL");
export const DB = Symbol("DB");

/**
 * Global database module: one pool, one Drizzle instance, injectable everywhere.
 * Tenant-scoped work still goes through withTenant()/withPlatform() (rls.ts),
 * which open their own transaction on the pool.
 */
@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: (): Pool => getPool() },
    { provide: DB, useFactory: (): Database => createDb() },
  ],
  exports: [PG_POOL, DB],
})
export class DatabaseModule {}
