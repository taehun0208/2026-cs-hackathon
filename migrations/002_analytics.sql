CREATE TABLE IF NOT EXISTS analytics_preferences (
  owner_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
  epoch TEXT NOT NULL,
  participant_code TEXT,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_events (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  participant_code TEXT,
  consent_epoch TEXT NOT NULL,
  event_json JSONB NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS lab_events_owner_time ON lab_events(owner_key,created_at);
CREATE INDEX IF NOT EXISTS lab_events_created_at ON lab_events(created_at);
CREATE TABLE IF NOT EXISTS analytics_usage (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK(count >= 0)
);
