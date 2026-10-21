import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-pipe.js";
import { requireTenantId } from "../tenancy/tenant-context.js";
import { AuthzService } from "../authz/authz.service.js";
import { CurrentPrincipal, Public } from "../authz/decorators.js";
import type { Principal } from "../authz/principal.js";
import { AuthService, type TokenPair } from "./auth.service.js";

const Purpose = z.enum(["login", "step_up", "enrol"]).default("login");

const RequestOtpSchema = z.object({
  identifier: z.string().min(3).max(320),
  channel: z.enum(["sms", "email"]).optional(),
  purpose: Purpose,
});
type RequestOtpDto = z.infer<typeof RequestOtpSchema>;

const VerifyOtpSchema = z.object({
  identifier: z.string().min(3).max(320),
  code: z.string().regex(/^\d{4,10}$/, "code must be 4-10 digits"),
  purpose: Purpose,
});
type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

const RefreshSchema = z.object({ refreshToken: z.string().min(16) });
type RefreshDto = z.infer<typeof RefreshSchema>;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly authz: AuthzService,
  ) {}

  /** Start an OTP login. Public: the caller has no session yet. */
  @Public()
  @Post("otp/request")
  @HttpCode(202)
  requestOtp(
    @Body(new ZodValidationPipe(RequestOtpSchema)) body: RequestOtpDto,
  ): Promise<{ status: "sent"; devCode?: string }> {
    const tenantId = requireTenantId();
    const channel = body.channel ?? (body.identifier.includes("@") ? "email" : "sms");
    return this.auth.requestOtp(tenantId, body.identifier, channel, body.purpose);
  }

  /** Complete OTP login and receive a token pair. */
  @Public()
  @Post("otp/verify")
  @HttpCode(200)
  verifyOtp(
    @Body(new ZodValidationPipe(VerifyOtpSchema)) body: VerifyOtpDto,
    @Req() req: Request,
  ): Promise<TokenPair> {
    const tenantId = requireTenantId();
    return this.auth.verifyOtp(tenantId, body.identifier, body.code, body.purpose, meta(req));
  }

  /** Rotate a refresh token for a fresh access token. */
  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto,
    @Req() req: Request,
  ): Promise<TokenPair> {
    const tenantId = requireTenantId();
    return this.auth.refresh(tenantId, body.refreshToken, meta(req));
  }

  /** Revoke the current session. Requires a valid access token. */
  @Post("logout")
  @HttpCode(204)
  async logout(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.auth.logout(principal.tenantId, principal.sessionId);
  }

  /** The current caller and their effective permission keys. */
  @Get("me")
  async me(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ principal: Principal; permissions: string[] }> {
    const permissions = await this.authz.effectivePermissionKeys(principal);
    return { principal, permissions };
  }
}

function meta(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.header("user-agent") ?? undefined };
}
