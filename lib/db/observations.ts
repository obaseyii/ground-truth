import type { ObservationStatus } from "../types";
import { getDb, transaction } from "./client";

export interface ObservationRow {
  id: string;
  contributor: string;
  market_id: string | null;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  captured_at: number;
  nonce: string | null;
  image_hash: string | null;
  confidence: number | null;
  status: ObservationStatus;
  reason: string | null;
  payout_attempted_at: number | null;
  payout_tx: string | null;
  created_at: number;
}

export interface NewPrice {
  item: string;
  raw_label: string;
  price: number;
  currency: string;
  unit: string;
}

export type NewObservation = Omit<ObservationRow, "payout_attempted_at" | "payout_tx" | "created_at">;

/** Inserts an observation and its prices in one transaction. */
export function insertObservation(obs: NewObservation, prices: NewPrice[] = [], now = Date.now()): void {
  transaction((db) => {
    db.prepare(
      `INSERT INTO observations (id, contributor, market_id, lat, lon, accuracy, captured_at, nonce,
         image_hash, confidence, status, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      obs.id, obs.contributor, obs.market_id, obs.lat, obs.lon, obs.accuracy, obs.captured_at,
      obs.nonce, obs.image_hash, obs.confidence, obs.status, obs.reason, now,
    );
    const insertPrice = db.prepare(
      `INSERT INTO prices (observation_id, item, raw_label, price, currency, unit, market_id, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of prices) {
      insertPrice.run(obs.id, p.item, p.raw_label, p.price, p.currency, p.unit, obs.market_id, obs.captured_at);
    }
  });
}

export function getObservation(id: string): ObservationRow | undefined {
  return getDb().prepare("SELECT * FROM observations WHERE id = ?").get(id) as unknown as ObservationRow | undefined;
}

/** Image hashes of observations created at or after `since` (ms). */
export function recentImageHashes(since: number): { id: string; image_hash: string }[] {
  return getDb()
    .prepare("SELECT id, image_hash FROM observations WHERE created_at >= ? AND image_hash IS NOT NULL")
    .all(since) as unknown as { id: string; image_hash: string }[];
}

/**
 * Claims the right to pay an observation. Returns true at most once per observation,
 * so a payout is never sent twice, even if the caller retries.
 */
export function claimPayout(id: string, now = Date.now()): boolean {
  const res = getDb()
    .prepare(
      `UPDATE observations SET payout_attempted_at = ?
       WHERE id = ? AND status = 'verified' AND payout_attempted_at IS NULL AND payout_tx IS NULL`,
    )
    .run(now, id);
  return Number(res.changes) === 1;
}

export function recordPayout(id: string, signature: string): void {
  getDb().prepare("UPDATE observations SET payout_tx = ? WHERE id = ?").run(signature, id);
}

export function markPayoutFailed(id: string, reason: string): void {
  getDb().prepare("UPDATE observations SET status = 'payout_failed', reason = ? WHERE id = ?").run(reason, id);
}

/** Deletes observations (and their prices) by id. Used by local test scripts only. */
export function deleteObservations(ids: string[]): number {
  if (ids.length === 0) return 0;
  return transaction((db) => {
    const del = db.prepare("DELETE FROM observations WHERE id = ?");
    let n = 0;
    for (const id of ids) n += Number(del.run(id).changes);
    return n;
  });
}
