import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { Principal } from "./principal.js";

/** Marks a route as not requiring authentication (AuthGuard lets it through). */
export const IS_PUBLIC_KEY = "authz:public";
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Route-level permission requirement, read by PermissionGuard. */
export const REQUIRE_PERMISSION_KEY = "authz:require_permission";

export interface RequirePermissionOptions {
  permission: string;
  /** Route param names that identify the target, so the guard can build scope. */
  personIdParam?: string;
  schoolIdParam?: string;
  facultyIdParam?: string;
  departmentIdParam?: string;
  programmeIdParam?: string;
}

export const RequirePermission = (
  options: RequirePermissionOptions | string,
): MethodDecorator & ClassDecorator =>
  SetMetadata(
    REQUIRE_PERMISSION_KEY,
    typeof options === "string" ? { permission: options } : options,
  );

/** Injects the authenticated Principal into a handler parameter. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.principal;
  },
);
