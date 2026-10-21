import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit is used for TYPES and to *generate* candidate SQL during
 * development. The committed files in ./migrations remain the source of truth
 * for what actually runs (they include RLS policies drizzle-kit does not emit).
 * See ADR-0002.
 */
export default {
  schema: "./src/database/schema/index.ts",
  out: "./migrations/_generated",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://atlas_app:atlas_app@localhost:5432/atlas",
  },
} satisfies Config;
