import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const entries = [
  "lib/storage.ts",
  "scripts/migrate-db.mjs",
  "scripts/report-analytics.mjs",
  "scripts/report-ai-budget.mjs",
];
const primary = "postgresql://test:test@primary.invalid/test";
const fallback = "postgresql://test:test@fallback.invalid/test";

for (const entry of entries) {
  test(`${entry} accepts POSTGRES_URL when DATABASE_URL is blank and preserves primary precedence`, () => {
    // Run outside the checkout so no developer .env.local is loaded. Replace
    // the database driver before importing the real entrypoint: no network/DB.
    const cwd = mkdtempSync(join(tmpdir(), "compfit-db-config-"));
    const target = new URL(`../${entry}`, import.meta.url).href;
    const stub = `export function neon(url) {
      if (url !== process.env.EXPECTED_DB) throw new Error("WRONG_DATABASE_SELECTION");
      globalThis.databaseConfigured = true;
      const query = async () => [];
      query.query = query;
      query.transaction = async () => [];
      return query;
    }`;
    const source = `
      import { registerHooks } from "node:module";
      registerHooks({
        resolve(specifier, context, next) {
          return specifier === "@neondatabase/serverless"
            ? { url: "mock:neon", shortCircuit: true }
            : next(specifier, context);
        },
        load(url, context, next) {
          return url === "mock:neon"
            ? { format: "module", source: ${JSON.stringify(stub)}, shortCircuit: true }
            : next(url, context);
        },
      });
      const entry = await import(${JSON.stringify(target)});
      if (entry.getStorage) await (await entry.getStorage()).read("synthetic-test");
      if (!globalThis.databaseConfigured) throw new Error("DATABASE_NOT_USED");
    `;
    try {
      for (const [database, expected] of [
        ["", fallback],
        [" \n ", fallback],
        [` ${primary} `, primary],
      ]) {
        const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
          cwd,
          encoding: "utf8",
          timeout: 10000,
          env: {
            NODE_ENV: "production",
            VERCEL: "1",
            DATABASE_URL: database,
            POSTGRES_URL: ` ${fallback} `,
            EXPECTED_DB: expected,
            OPENAI_MODEL: "gpt-4.1-mini",
            AI_DAILY_BUDGET_USD: "1",
            AI_MONTHLY_BUDGET_USD: "10",
          },
        });
        assert.equal(result.status, 0, result.stderr);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
