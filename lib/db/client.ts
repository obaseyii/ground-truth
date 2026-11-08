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
  db = conn;
  return db;
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
