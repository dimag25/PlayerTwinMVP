import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL_MODE === "require" ? { rejectUnauthorized: false } : undefined
});

try {
  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const migrationDir = join(process.cwd(), "migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const applied = await pool.query("select 1 from schema_migrations where version = $1", [file]);
    if (applied.rowCount) {
      console.log(`Already applied ${file}`);
      continue;
    }

    const sql = await readFile(join(migrationDir, file), "utf-8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (version) values ($1)", [file]);
      await pool.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
} finally {
  await pool.end();
}
