-- Opt-in welcome-survey answers: one row per random install id (a retake overwrites, a withdrawal deletes).
CREATE TABLE IF NOT EXISTS survey (
  install_id   TEXT PRIMARY KEY,
  uses         TEXT NOT NULL DEFAULT '',
  uses_other   TEXT,
  heard_from   TEXT,
  heard_other  TEXT,
  platform     TEXT,
  app_version  TEXT,
  answered_on  TEXT,
  received_on  TEXT
);

-- The daily user-count ping: one row per random install id.
CREATE TABLE IF NOT EXISTS installs (
  id          TEXT PRIMARY KEY,
  platform    TEXT,
  app_version TEXT,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  days_seen   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS installs_last_seen ON installs (last_seen);
