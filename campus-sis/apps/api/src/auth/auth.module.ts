import { Module } from "@nestjs/common";
import { AuthzModule } from "../authz/authz.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OtpService } from "./otp.service.js";

/**
 * Authentication plane: OTP login + session lifecycle. Depends on AuthzModule
 * for TokenService (token signing) and AuthzService (effective permissions on
 * /auth/me).
 */
@Module({
  imports: [AuthzModule],
  controllers: [AuthController],
  providers: [AuthService, OtpService],
})
export class AuthModule {}
