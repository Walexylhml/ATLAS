/**
 * Minimal, dependency-light migration runner. SQL files in ./migrations are the
 * single source of truth for DDL + RLS (see ADR-0002). Each file runs once, in
 * filename order, inside its own transaction; applied files are recorded in
 * `_migrations`. Re-running is a no-op — safe to call on every deploy.
 *
 *   pnpm db:migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "./pool.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

async function run(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const appliedRows = await client.query<{ id: string }>("SELECT id FROM _migrations");
    const applied = new Set(appliedRows.rows.map((r) => r.id));

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`• skip   ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`▶ apply  ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (id) VALUES ($1)", [file]);
        await client.query("COMMIT");
        ran += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`✗ failed ${file}`);
        throw err;
      }
    }
    console.log(ran === 0 ? "✔ up to date" : `✔ applied ${ran} migration(s)`);
  } finally {
    client.release();
    await closePool();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
