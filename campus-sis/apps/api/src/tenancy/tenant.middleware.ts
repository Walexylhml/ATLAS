import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { requestContext, type RequestContext } from "./tenant-context.js";

/**
 * Resolves the tenant for the request and opens an AsyncLocalStorage scope.
 *
 * Phase 0: tenant comes from the `X-Tenant-Id` header (set by the gateway /
 * dev client). Later it will be derived from the authenticated session and the
 * request host (subdomain → tenant), and this header path restricted to
 * trusted internal callers. Resolution rules live here, in one place.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const headerTenant = req.header("x-tenant-id");
    const ctx: RequestContext = {
      tenantId: headerTenant && headerTenant.trim() !== "" ? headerTenant : undefined,
      isPlatform: false,
      requestId: req.header("x-request-id") ?? randomUUID(),
    };
    requestContext.run(ctx, () => next());
  }
}
