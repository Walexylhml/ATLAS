import { Global, Module } from "@nestjs/common";
import { ConfigService } from "./config.service.js";

/** Tenant configuration service, injectable everywhere. */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
