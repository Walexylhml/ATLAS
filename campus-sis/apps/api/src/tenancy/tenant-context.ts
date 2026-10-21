import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  tenantId?: string;
  actorId?: string;
  isPlatform: boolean;
  requestId?: string;
}

/**
 * Per-request context carried implicitly through the async call tree, so a
 * service deep in a module can resolve the current tenant without threading it
 * through every signature. Populated by TenantMiddleware.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/** Throws if there is no tenant in scope — use before touching tenant data. */
export function requireTenantId(): string {
  const ctx = requestContext.getStore();
  if (!ctx?.tenantId) {
    throw new Error("No tenant in request context");
  }
  return ctx.tenantId;
}
