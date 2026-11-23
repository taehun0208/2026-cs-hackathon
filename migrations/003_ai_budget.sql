CREATE TABLE IF NOT EXISTS ai_budget_ledger (
  period TEXT PRIMARY KEY,
  revision BIGINT NOT NULL,
  state JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);
