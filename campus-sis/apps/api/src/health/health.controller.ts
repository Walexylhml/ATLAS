import { Controller, Get, Inject } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module.js";
import { Public } from "../authz/decorators.js";

// Liveness/readiness are probed by the platform (Render/Railway) with no
// credentials — they must bypass the global auth guard.
@Public()
@Controller()
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Liveness: the process is up. Cheap, no dependencies. */
  @Get("healthz")
  liveness(): { status: string; service: string } {
    return { status: "ok", service: "atlas-api" };
  }

  /** Readiness: can we actually serve traffic (DB reachable)? */
  @Get("readyz")
  async readiness(): Promise<{ status: string; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};
    let healthy = true;
    try {
      await this.pool.query("SELECT 1");
      checks.database = "up";
    } catch {
      checks.database = "down";
      healthy = false;
    }
    return { status: healthy ? "ready" : "degraded", checks };
  }
}
