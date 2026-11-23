import fs from "node:fs";
import { summarizeAnalytics } from "../lib/analytics-report.ts";
const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = value("--input"),
  cohort = value("--cohort") ?? "all";
if (!["all", "pilot", "general"].includes(cohort))
  throw new Error("cohort must be all, pilot, or general");
let rows;
if (input) rows = JSON.parse(fs.readFileSync(input, "utf8"));
else {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("Database is not configured");
  const since =
      value("--since") ??
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    until =
      value("--until") ??
      new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const start = Date.parse(since + "T00:00:00Z"),
    end = Date.parse(until + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    throw new Error("Use an increasing UTC date range (until is exclusive)");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  let records;
  try {
    records = await sql.query(
      "SELECT owner_key,participant_code,event_json,created_at FROM lab_events WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at,id LIMIT 50001",
      [start, end],
    );
  } catch {
    throw new Error(
      "분석 저장소에 연결하지 못했습니다. 서버 설정과 마이그레이션을 확인하세요.",
    );
  }
  if (records.length > 50000)
    throw new Error("Narrow the date range; partial reports are not produced");
  rows = records.map((r) => ({
    owner: r.owner_key,
    participantCode: r.participant_code,
    receivedAt: Number(r.created_at),
    event:
      typeof r.event_json === "string"
        ? JSON.parse(r.event_json)
        : r.event_json,
  }));
}
if (!Array.isArray(rows)) throw new Error("Input must be an event-row array");
console.log(
  JSON.stringify(
    summarizeAnalytics(rows, {
      cohort,
      includeQA: args.includes("--include-qa"),
    }),
    null,
    2,
  ),
);
