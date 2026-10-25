import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AuthzModule } from "./authz/authz.module.js";
import { DirectoryModule } from "./directory/directory.module.js";
import { AcademicModule } from "./academic/academic.module.js";
import { StudentsModule } from "./students/students.module.js";
import { CoursesModule } from "./courses/courses.module.js";
import { RegistrationModule } from "./registration/registration.module.js";
import { FinanceModule } from "./finance/finance.module.js";
import { HoldsModule } from "./holds/holds.module.js";
import { ReportingModule } from "./reporting/reporting.module.js";
import { ConfigModule } from "./config/config.module.js";
import { TenantMiddleware } from "./tenancy/tenant.middleware.js";
import { loadEnv } from "./config/env.js";
import { currentContext } from "./tenancy/tenant-context.js";

const env = loadEnv();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        // Pretty logs in dev; structured JSON everywhere else.
        transport:
          env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
        // Stamp every log line with the request + tenant context.
        customProps: () => {
          const ctx = currentContext();
          return {
            requestId: ctx?.requestId,
            tenantId: ctx?.tenantId,
          };
        },
        redact: ["req.headers.authorization", "req.headers.cookie"],
      },
    }),
    DatabaseModule,
    ConfigModule,
    AuthzModule,
    AuthModule,
    DirectoryModule,
    AcademicModule,
    StudentsModule,
    CoursesModule,
    RegistrationModule,
    FinanceModule,
    HoldsModule,
    ReportingModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("{*path}");
  }
}
