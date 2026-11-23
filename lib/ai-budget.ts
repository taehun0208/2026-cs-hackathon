// USD nanodollars keep fractional per-token rates exact without floating-point money.
export const USD_UNITS = 1_000_000_000;
export const COACH_ROUNDS = 3;
export const COACH_OUTPUT_TOKENS = 500;
export const MAX_PROVIDER_PAYLOAD_BYTES = 131072;
export const PROMPT_FRAMING_TOKEN_ALLOWANCE = 2048;
export const PRICING_VERSION = "gpt-4.1-mini-standard-2026-11-23";
export type BudgetPolicy = {
  dailyUnits: number;
  monthlyUnits: number;
  pricingVersion: string;
  inputUnitsPerToken: number;
  outputUnitsPerToken: number;
};
export function parseUsd(value: string): number | null {
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,9})?$/.test(value)) return null;
  const [whole, decimal = ""] = value.split(".");
  const amount = Number(whole) * USD_UNITS + Number(decimal.padEnd(9, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
export function budgetPolicy(
  model: string,
  env: Record<string, string | undefined> = process.env,
): BudgetPolicy | null {
  if (!["gpt-4.1-mini", "gpt-4.1-mini-2025-04-14"].includes(model)) return null;
  const dailyUnits = parseUsd(env.AI_DAILY_BUDGET_USD ?? "1");
  const monthlyUnits = parseUsd(env.AI_MONTHLY_BUDGET_USD ?? "10");
  if (dailyUnits === null || monthlyUnits === null) return null;
  return {
    dailyUnits,
    monthlyUnits,
    pricingVersion: PRICING_VERSION,
    inputUnitsPerToken: 400,
    outputUnitsPerToken: 1600,
  };
}
export function reservationUnits(policy: BudgetPolicy) {
  return (
    COACH_ROUNDS *
    ((MAX_PROVIDER_PAYLOAD_BYTES + PROMPT_FRAMING_TOKEN_ALLOWANCE) *
      policy.inputUnitsPerToken +
      COACH_OUTPUT_TOKENS * policy.outputUnitsPerToken)
  );
}
export function usageUnits(
  policy: BudgetPolicy,
  input: number,
  output: number,
) {
  if (![input, output].every((n) => Number.isSafeInteger(n) && n >= 0))
    return null;
  const cost =
    input * policy.inputUnitsPerToken + output * policy.outputUnitsPerToken;
  return Number.isSafeInteger(cost) ? cost : null;
}
export function validUsage(
  usage: unknown,
): usage is { prompt_tokens: number; completion_tokens: number } {
  if (!usage || typeof usage !== "object") return false;
  const u = usage as Record<string, unknown>;
  return [u.prompt_tokens, u.completion_tokens].every(
    (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
  );
}
export const usd = (units: number) => Number((units / USD_UNITS).toFixed(9));

export type BudgetWarning = {
  reason:
    | "warning80"
    | "limit"
    | "configuration"
    | "storage_unavailable"
    | "settlement_unconfirmed"
    | "usage_unconfirmed"
    | "contention";
  scope?: "daily" | "monthly" | "ledger";
  period?: string;
  day?: string;
  accountedUsd?: number;
  limitUsd?: number;
};
export function warnBudget(record: BudgetWarning) {
  // Explicit allowlist, even if a future caller supplies an extra runtime field.
  const { reason, scope, period, day, accountedUsd, limitUsd } = record;
  try {
    console.warn(
      JSON.stringify({
        event: "ai_budget",
        reason,
        scope,
        period,
        day,
        accountedUsd,
        limitUsd,
      }),
    );
  } catch {}
}
