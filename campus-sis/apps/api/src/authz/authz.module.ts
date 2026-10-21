import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TokenService } from "../auth/token.service.js";
import { AuthzService } from "./authz.service.js";
import { AuthGuard } from "./auth.guard.js";
import { PermissionGuard } from "./permission.guard.js";

/**
 * Authorization plane. Registers the two global guards IN ORDER — AuthGuard
 * authenticates (Bearer → Principal), then PermissionGuard enforces
 * @RequirePermission. Hosts TokenService here (rather than in AuthModule) so the
 * guard can depend on it without AuthModule and AuthzModule importing each other.
 */
@Global()
@Module({
  providers: [
    AuthzService,
    TokenService,
    // Order matters: authenticate before authorizing.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthzService, TokenService],
})
export class AuthzModule {}
