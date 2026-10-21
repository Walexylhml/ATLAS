import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthzService } from "./authz.service.js";
import { REQUIRE_PERMISSION_KEY, type RequirePermissionOptions } from "./decorators.js";
import type { AccessTarget } from "./permissions.js";

/**
 * Enforces @RequirePermission. Runs after AuthGuard, so req.principal is set.
 * A route with no @RequirePermission passes (authentication alone suffices).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly log = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RequirePermissionOptions | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const principal = req.principal;
    if (!principal) throw new UnauthorizedException("Authentication required");

    const target = buildTarget(options, (req.params ?? {}) as Record<string, string>);
    const decision = await this.authz.authorize(principal, options.permission, target);
    if (!decision.allowed) {
      this.log.warn(
        `deny account=${principal.accountId} perm=${options.permission}: ${decision.reason}`,
      );
      throw new ForbiddenException(decision.reason);
    }
    return true;
  }
}

function buildTarget(
  options: RequirePermissionOptions,
  params: Record<string, string>,
): AccessTarget {
  const target: AccessTarget = {};
  if (options.personIdParam) target.personId = params[options.personIdParam];
  if (options.schoolIdParam) target.schoolId = params[options.schoolIdParam];
  if (options.facultyIdParam) target.facultyId = params[options.facultyIdParam];
  if (options.departmentIdParam) target.departmentId = params[options.departmentIdParam];
  if (options.programmeIdParam) target.programmeId = params[options.programmeIdParam];
  return target;
}
