import { z } from "zod";
import type { Query } from "./storage.ts";
import {
  type BudgetPolicy,
  type BudgetWarning,
  usd,
  warnBudget,
} from "./ai-budget.ts";
const units = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const entrySchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reservedUnits: units,
    chargedUnits: units.nullable(),
    status: z.enum(["pending", "settled", "uncertain"]),
    pricingVersion: z.string().min(1).max(100),
  })
  .strict()
  .refine(
    (entry) =>
      entry.status === "settled"
        ? entry.chargedUnits !== null
        : entry.chargedUnits === null,
    "Accounting status and charge must agree",
  );
const stateSchema = z
  .object({
    version: z.literal(1),
    entries: z.record(z.string().uuid(), entrySchema),
  })
  .strict();
type Ledger = z.infer<typeof stateSchema>;
export type BudgetLease = { period: string; id: string };
export interface AiBudgetStorage {
  reserveAiBudget(
    id: string,
    amount: number,
    policy: BudgetPolicy,
  ): Promise<BudgetLease | null>;
  finishAiBudget(lease: BudgetLease, actualUnits: number | null): Promise<void>;
  readAiBudget(): Promise<ReturnType<typeof summarizeBudget>>;
  cleanupAiBudget(): Promise<number>;
}
function readState(raw: unknown): Ledger {
  const state = stateSchema.parse(
    typeof raw === "string" ? JSON.parse(raw) : raw,
  );
  if (Object.keys(state.entries).length > 10000)
    throw new Error("BUDGET_LEDGER_LIMIT");
  return state;
}
export function summarizeBudget(state: Ledger, day: string) {
  const entries = Object.values(state.entries);
  const sum = (rows: typeof entries) =>
    rows.reduce((n, e) => n + (e.chargedUnits ?? e.reservedUnits), 0);
  const pending = entries.filter((e) => e.chargedUnits === null);
  return {
    day,
    period: day.slice(0, 7),
    dailyAccountedUsd: usd(sum(entries.filter((e) => e.day === day))),
    monthlyAccountedUsd: usd(sum(entries)),
    settledUsd: usd(entries.reduce((n, e) => n + (e.chargedUnits ?? 0), 0)),
    retainedReserveUsd: usd(sum(pending)),
    pendingCount: pending.filter((e) => e.status === "pending").length,
    uncertainCount: pending.filter((e) => e.status === "uncertain").length,
    settledCount: entries.length - pending.length,
  };
}
export function createAiBudgetStorage(
  query: Query,
  now = Date.now,
  reporter: (warning: BudgetWarning) => void = warnBudget,
): AiBudgetStorage {
  const warn = (record: BudgetWarning) => {
    try {
      reporter(record);
    } catch {}
  };
  const empty = () => ({ version: 1 as const, entries: {} });
  // Both the daily and monthly checks use one CAS on one monthly row. A losing
  // concurrent writer retries with fresh totals; there is no cross-row partial hold.
  const mutate = async <T>(
    period: string,
    operation: (s: Ledger) => T | null,
  ): Promise<T | null> => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const [row] = await query(
        "SELECT revision,state FROM ai_budget_ledger WHERE period=$1",
        [period],
      );
      if (!row) return null;
      const state = readState(row.state),
        result = operation(state);
      if (result === null) return null;
      const updated = await query(
        "UPDATE ai_budget_ledger SET state=$1,revision=revision+1,updated_at=$2 WHERE period=$3 AND revision=$4 RETURNING period",
        [JSON.stringify(state), now(), period, Number(row.revision)],
      );
      if (updated.length) return result;
    }
    warn({ reason: "contention", scope: "ledger", period });
    return null;
  };
  return {
    async reserveAiBudget(id, amount, policy) {
      z.string().uuid().parse(id);
      units.positive().parse(amount);
      units.parse(policy.dailyUnits);
      units.parse(policy.monthlyUnits);
      const day = new Date(now()).toISOString().slice(0, 10),
        period = day.slice(0, 7);
      await query(
        "INSERT INTO ai_budget_ledger(period,revision,state,updated_at) VALUES($1,0,$2,$3) ON CONFLICT(period) DO NOTHING",
        [period, JSON.stringify(empty()), now()],
      );
      const reserved = await mutate(period, (state) => {
        if (state.entries[id]) return null;
        const values = Object.values(state.entries);
        const total = (rows: typeof values) =>
          rows.reduce((n, e) => n + (e.chargedUnits ?? e.reservedUnits), 0);
        const daily = total(values.filter((e) => e.day === day));
        const monthly = total(values);
        if (values.length >= 10000) {
          warn({ reason: "limit", scope: "ledger", period, day });
          return null;
        }
        const dailyBlocked = daily + amount > policy.dailyUnits;
        const monthlyBlocked = monthly + amount > policy.monthlyUnits;
        if (dailyBlocked || monthlyBlocked) {
          if (dailyBlocked)
            warn({
              reason: "limit",
              scope: "daily",
              period,
              day,
              accountedUsd: usd(daily),
              limitUsd: usd(policy.dailyUnits),
            });
          if (monthlyBlocked)
            warn({
              reason: "limit",
              scope: "monthly",
              period,
              day,
              accountedUsd: usd(monthly),
              limitUsd: usd(policy.monthlyUnits),
            });
          return null;
        }
        state.entries[id] = {
          day,
          reservedUnits: amount,
          chargedUnits: null,
          status: "pending",
          pricingVersion: policy.pricingVersion,
        };
        return {
          lease: { id, period },
          daily: daily + amount,
          monthly: monthly + amount,
        };
      });
      if (!reserved) return null;
      if (reserved.daily >= policy.dailyUnits * 0.8)
        warn({
          reason: "warning80",
          scope: "daily",
          period,
          day,
          accountedUsd: usd(reserved.daily),
          limitUsd: usd(policy.dailyUnits),
        });
      if (reserved.monthly >= policy.monthlyUnits * 0.8)
        warn({
          reason: "warning80",
          scope: "monthly",
          period,
          day,
          accountedUsd: usd(reserved.monthly),
          limitUsd: usd(policy.monthlyUnits),
        });
      return reserved.lease;
    },
    async finishAiBudget(lease, actualUnits) {
      z.string().uuid().parse(lease.id);
      z.string()
        .regex(/^\d{4}-\d{2}$/)
        .parse(lease.period);
      if (actualUnits !== null) units.parse(actualUnits);
      const settled = await mutate(lease.period, (state) => {
        const e = state.entries[lease.id];
        if (!e) return null;
        if (e.status !== "pending") return true;
        e.chargedUnits = actualUnits;
        e.status = actualUnits === null ? "uncertain" : "settled";
        return true;
      });
      // A failed confirmation keeps the original hold and makes the coach fall back.
      if (!settled) throw new Error("BUDGET_SETTLEMENT_NOT_CONFIRMED");
    },
    async readAiBudget() {
      const day = new Date(now()).toISOString().slice(0, 10),
        period = day.slice(0, 7);
      const [row] = await query(
        "SELECT state FROM ai_budget_ledger WHERE period=$1",
        [period],
      );
      return summarizeBudget(row ? readState(row.state) : empty(), day);
    },
    async cleanupAiBudget() {
      const today = new Date(now());
      const cutoff = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1),
      )
        .toISOString()
        .slice(0, 7);
      return (
        await query(
          "DELETE FROM ai_budget_ledger WHERE period < $1 RETURNING period",
          [cutoff],
        )
      ).length;
    },
  };
}
