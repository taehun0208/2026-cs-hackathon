import { neon } from "@neondatabase/serverless";
import type { LabState } from "./missions";
import {
  createAnalyticsStorage,
  type AnalyticsStorage,
} from "./analytics-store.ts";
import { RETENTION_MS } from "./retention.ts";

export class RecordDeleted extends Error {}

type SavedState = { state: LabState; updatedAt: number };
export interface LabStorage extends AnalyticsStorage {
  read(owner: string): Promise<SavedState | null>;
  save(owner: string, state: LabState): Promise<number>;
  remove(owner: string): Promise<void>;
  cleanup(): Promise<{
    states: number;
    calls: number;
    usage: number;
    events: number;
    preferences: number;
    analyticsUsage: number;
  }>;
  reserve(owner: string, track: string): Promise<boolean>;
  logUsage(entry: {
    owner: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    outcome: string;
  }): Promise<void>;
}

export type Query = (
  text: string,
  values: unknown[],
) => Promise<Record<string, unknown>[]>;

export function createStorage(query: Query, now = Date.now): LabStorage {
  const analytics = createAnalyticsStorage(query, now);
  return {
    ...analytics,
    async read(owner) {
      const [row] = await query(
        "SELECT state,updated_at FROM lab_states WHERE owner_key=$1",
        [owner],
      );
      if (!row) return null;
      if (row.state === "null" || row.state === null) return null;
      if (Number(row.updated_at) <= now() - RETENTION_MS) {
        await query(
          "DELETE FROM lab_states WHERE owner_key=$1 AND updated_at <= $2",
          [owner, now() - RETENTION_MS],
        );
        return null;
      }
      return {
        state: (typeof row.state === "string"
          ? JSON.parse(row.state)
          : row.state) as LabState,
        updatedAt: Number(row.updated_at),
      };
    },
    async save(owner, state) {
      const timestamp = now();
      const rows = await query(
        "INSERT INTO lab_states(owner_key,state,updated_at) VALUES ($1,$2,$3) ON CONFLICT(owner_key) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at WHERE lab_states.state <> 'null' RETURNING updated_at",
        [owner, JSON.stringify(state), timestamp],
      );
      if (!rows.length) throw new RecordDeleted("RECORD_DELETED");
      return Number(rows[0].updated_at);
    },
    async remove(owner) {
      await analytics.eraseAnalytics(owner);
      // JSON null fences old-session writes, including a timed-out request that
      // reaches the database after deletion. It contains no learner content.
      await query(
        "INSERT INTO lab_states(owner_key,state,updated_at) VALUES ($1,$2,$3) ON CONFLICT(owner_key) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at",
        [owner, "null", now()],
      );
      await query("DELETE FROM ai_calls WHERE owner_key=$1", [owner]);
    },
    async cleanup() {
      const cutoff = now() - RETENTION_MS;
      const states = await query(
        "DELETE FROM lab_states WHERE updated_at <= $1 RETURNING owner_key",
        [cutoff],
      );
      const calls = await query(
        "DELETE FROM ai_calls WHERE created_at <= $1 RETURNING id",
        [cutoff],
      );
      // Only UTC days before today; keep today's limits after record deletion.
      const usage = await query(
        "DELETE FROM ai_usage WHERE key < $1 RETURNING key",
        [new Date(now()).toISOString().slice(0, 10) + ":"],
      );
      const cleaned = await analytics.cleanupAnalytics();
      return {
        ...cleaned,
        states: states.length,
        calls: calls.length,
        usage: usage.length,
      };
    },
    async reserve(owner, track) {
      const day = new Date(now()).toISOString().slice(0, 10);
      const reserve = async (key: string, limit: number) =>
        (
          await query(
            "INSERT INTO ai_usage(key,count) VALUES ($1,1) ON CONFLICT(key) DO UPDATE SET count=ai_usage.count+1 WHERE ai_usage.count < $2 RETURNING count",
            [day + ":" + key, limit],
          )
        ).length > 0;
      // Conditional upserts enforce each cap even across parallel serverless instances.
      if (!(await reserve(owner, 22))) return false;
      if (!(await reserve(owner + ":" + track, 6))) return false;
      return reserve("global", 200);
    },
    async logUsage(e) {
      // Lock the same owner row that deletion replaces, so an in-flight call
      // either commits before its logs are erased, or sees the deletion fence.
      await query(
        "INSERT INTO ai_calls(id,owner_key,model,input_tokens,output_tokens,latency_ms,outcome,created_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8 FROM (SELECT owner_key FROM lab_states WHERE owner_key=$9 AND state <> 'null' FOR UPDATE) AS owner",
        [
          crypto.randomUUID(),
          e.owner,
          e.model,
          e.inputTokens,
          e.outputTokens,
          e.latencyMs,
          e.outcome,
          now(),
          e.owner,
        ],
      );
    },
  };
}

let cached: LabStorage | undefined;
export async function getStorage(): Promise<LabStorage> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (url) {
    const sql = neon(url);
    cached = createStorage(
      (text, values) =>
        sql.query(text, values, {
          fetchOptions: { signal: AbortSignal.timeout(6000) },
        }) as Promise<Record<string, unknown>[]>,
    );
    return cached;
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new Error("DATABASE_NOT_CONFIGURED");
  // Local development only. A serverless deployment must have durable storage.
  const { DatabaseSync } = await import("node:sqlite");
  const { mkdirSync, readFileSync } = await import("node:fs");
  const { dirname, resolve } = await import("node:path");
  const path = process.env.LAB_SQLITE_PATH ?? resolve(".local/lab.sqlite");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE IF NOT EXISTS lab_states(owner_key TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS ai_usage(key TEXT PRIMARY KEY,count INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS ai_calls(id TEXT PRIMARY KEY,owner_key TEXT NOT NULL,model TEXT NOT NULL,input_tokens INTEGER NOT NULL,output_tokens INTEGER NOT NULL,latency_ms INTEGER NOT NULL,outcome TEXT NOT NULL,created_at INTEGER NOT NULL);",
  );
  db.exec(readFileSync(resolve("migrations/002_analytics.sql"), "utf8"));
  cached = createStorage(async (text, values) => {
    // SQLite serializes writes; PostgreSQL needs the owner row lock.
    const sqlite = text.replace(/ FOR UPDATE/g, "").replace(/\$\d+/g, "?");
    const statement = db.prepare(sqlite);
    return statement.all(...(values as (string | number | null)[])) as Record<
      string,
      unknown
    >[];
  });
  return cached;
}
