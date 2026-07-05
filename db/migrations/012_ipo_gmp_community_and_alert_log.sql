-- Migration 012: IPO GMP community submissions + alert send deduplication
-- Safe to run multiple times (IF NOT EXISTS).

-- Community-sourced GMP with audit trail (V4 architecture)
CREATE TABLE IF NOT EXISTS ipo_gmp_community (
  id            BIGSERIAL PRIMARY KEY,
  ipo_id        INT NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
  gmp           NUMERIC(8,2) NOT NULL,
  source_url    TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  ip_hash       TEXT
);

CREATE INDEX IF NOT EXISTS idx_ipo_gmp_community_ipo_date
  ON ipo_gmp_community(ipo_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_ipo_gmp_community_verified
  ON ipo_gmp_community(ipo_id, submitted_at DESC)
  WHERE is_verified = TRUE;

-- Tracks which alert events were already emailed (prevents duplicate sends)
CREATE TABLE IF NOT EXISTS ipo_alert_log (
  id         BIGSERIAL PRIMARY KEY,
  alert_id   UUID NOT NULL REFERENCES ipo_alerts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(alert_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_ipo_alert_log_alert
  ON ipo_alert_log(alert_id);
