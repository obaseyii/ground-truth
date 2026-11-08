// Opens the local SQLite database with Node's built-in node:sqlite (Node 22.13+).
// Path: GT_DB_PATH, or data/gt.db under the working directory.
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "./schema";

let db: DatabaseSync | undefined;

export function dbPath(): string {
  const override = process.env.GT_DB_PATH?.trim();
  if (override) return resolve(/*turbopackIgnore: true*/ override);
  return join(process.cwd(), "data", "gt.db");
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  const conn = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5000 });
  conn.exec("PRAGMA journal_mode = WAL;");
  conn.exec(SCHEMA_SQL);
  migrate(conn);
  db = conn;
  return db;
}

// Columns added after the first schema. CREATE TABLE IF NOT EXISTS does not add them to an
// existing database, so add any that are missing.
const ADDED_COLUMNS: { table: string; column: string; type: string }[] = [
  { table: "observations", column: "image_width", type: "INTEGER" },
  { table: "observations", column: "image_height", type: "INTEGER" },
  { table: "observations", column: "image_bytes", type: "INTEGER" },
];

function migrate(conn: DatabaseSync) {
  for (const { table, column, type } of ADDED_COLUMNS) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Runs fn inside BEGIN IMMEDIATE / COMMIT, rolling back on any error. */
export function transaction<T>(fn: (conn: DatabaseSync) => T): T {
  const conn = getDb();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(conn);
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}
