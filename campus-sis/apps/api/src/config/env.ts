import { z } from "zod";

/** Local docker-compose DB — a dev/test convenience default, never for production. */
const DEV_DATABASE_URL = "postgres://atlas_app:atlas_app@localhost:5432/atlas";

/**
 * Environment contract. The app refuses to boot if required vars are missing or
 * malformed — fail fast and loud rather than at the first bad request.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // Defaults to the local docker-compose DB so pure unit tests (which validate
  // the whole env on import) run without a database. Production is guarded
  // below — a real DATABASE_URL must be set there.
  DATABASE_URL: z
    .string()
    .url()
    .startsWith("postgres")
    .default(DEV_DATABASE_URL),

  JWT_SECRET: z.string().min(16).default("change-me-dev-only"),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // Short-lived stateless access token; long-lived DB-backed refresh token.
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),

  // Optional in Phase 0 — wired up as the modules that need them land.
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  FLW_SECRET_KEY: z.string().optional(),
  FLW_WEBHOOK_SECRET_HASH: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.DATABASE_URL === DEV_DATABASE_URL) {
    throw new Error("DATABASE_URL must be set explicitly in production (got the dev default)");
  }
  cached = parsed.data;
  return cached;
}
