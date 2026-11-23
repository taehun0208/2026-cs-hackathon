import { readFileSync, existsSync, readdirSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
if (!url)
  throw new Error(
    "DATABASE_URL or POSTGRES_URL is required. Configure the target database before migrating.",
  );
const sql = neon(url);
const directory = new URL("../migrations/", import.meta.url);
const statements = readdirSync(directory)
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort()
  .flatMap((name) =>
    readFileSync(new URL(name, directory), "utf8")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean),
  );
await sql.transaction(statements.map((s) => sql.query(s, [])));
console.log("Database schema ready.");
