import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { currentContext } from "../tenancy/tenant-context.js";
import { TokenService } from "../auth/token.service.js";
import { IS_PUBLIC_KEY } from "./decorators.js";
import type { Principal } from "./principal.js";

/**
 * Turns a Bearer access token into a Principal, or rejects the request. Runs
 * before PermissionGuard. On success it also promotes the token's tenant into
 * the request context so RLS and logging bind to the *authenticated* tenant,
 * not the raw X-Tenant-Id header (which only seeds the public auth endpoints).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const claims = this.tokens.verifyAccessToken(header.slice("Bearer ".length).trim());
    if (!claims) throw new UnauthorizedException("Invalid or expired token");

    const principal: Principal = {
      accountId: claims.sub,
      personId: claims.pid,
      tenantId: claims.tid,
      sessionId: claims.sid,
      assurance: claims.aas,
    };
    req.principal = principal;

    const ctx = currentContext();
    if (ctx) {
      ctx.tenantId = principal.tenantId;
      ctx.actorId = principal.accountId;
      ctx.isPlatform = false;
    }
    return true;
  }
}
