// SQLite schema. Applied on every open; every statement is idempotent.
// Times are stored as integer milliseconds since the Unix epoch (UTC).
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS markets (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  lat       REAL NOT NULL,
  lon       REAL NOT NULL,
  radius_m  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce       TEXT PRIMARY KEY,
  wallet      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  used_at     INTEGER
);

CREATE TABLE IF NOT EXISTS observations (
  id                  TEXT PRIMARY KEY,
  contributor         TEXT NOT NULL,
  market_id           TEXT REFERENCES markets(id),
  lat                 REAL,
  lon                 REAL,
  accuracy            REAL,
  captured_at         INTEGER NOT NULL,
  nonce               TEXT,
  image_hash          TEXT,
  confidence          REAL,
  status              TEXT NOT NULL CHECK (status IN ('verified', 'rejected', 'review', 'payout_failed')),
  reason              TEXT,
  payout_attempted_at INTEGER,
  payout_tx           TEXT UNIQUE,
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_created_at ON observations (created_at);
CREATE INDEX IF NOT EXISTS observations_contributor ON observations (contributor, created_at);

CREATE TABLE IF NOT EXISTS prices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id  TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  item            TEXT NOT NULL,
  raw_label       TEXT NOT NULL,
  price           REAL NOT NULL,
  currency        TEXT NOT NULL,
  unit            TEXT NOT NULL,
  market_id       TEXT REFERENCES markets(id),
  captured_at     INTEGER NOT NULL,
  outlier         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS prices_item ON prices (item, market_id, captured_at);
`;
