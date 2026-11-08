// Public data feed: verified prices, one record per extracted item, plus totals.
// Used by GET /api/observations and scripts/export-observations.ts.
import { txUrl } from "../solana/explorer";
import type { FeedObservation, StatsResponse } from "../types";
import { getDb } from "./client";

export const FEED_LIMIT = 500;
const PAYOUT_USDC = 0.05;

export interface FeedFilter {
  /** Canonical item name, case-insensitive. */
  item?: string;
  /** Market id or market name, case-insensitive. */
  market?: string;
  limit?: number;
}

interface FeedRow {
  observation_id: string;
  item_index: number;
  contributor: string;
  item: string;
  price: number;
  currency: string;
  unit: string;
  market: string | null;
  lat: number | null;
  lon: number | null;
  captured_at: number;
  image_hash: string | null;
  confidence: number | null;
  payout_tx: string | null;
}

/**
 * Verified prices, newest first. The item index is the position of the price within its
 * observation (0-based, in extraction order) and is computed before filtering, so a record id
 * stays the same whatever filter is applied.
 */
export function listFeed(filter: FeedFilter = {}): FeedObservation[] {
  const where: string[] = ["o.status = 'verified'"];
  const args: (string | number)[] = [];
  if (filter.item) {
    where.push("lower(p.item) = lower(?)");
    args.push(filter.item);
  }
  if (filter.market) {
    where.push("(lower(m.id) = lower(?) OR lower(m.name) = lower(?))");
    args.push(filter.market, filter.market);
  }
  const limit = Math.min(Math.max(1, Math.trunc(filter.limit ?? FEED_LIMIT)), FEED_LIMIT);
  args.push(limit);

  const rows = getDb()
    .prepare(
      `SELECT o.id AS observation_id, p.item_index, o.contributor, p.item, p.price, p.currency, p.unit,
              m.name AS market,
              CASE WHEN o.lat IS NOT NULL AND o.lon IS NOT NULL THEN o.lat ELSE m.lat END AS lat,
              CASE WHEN o.lat IS NOT NULL AND o.lon IS NOT NULL THEN o.lon ELSE m.lon END AS lon,
              o.captured_at, o.image_hash, o.confidence, o.payout_tx
       FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY observation_id ORDER BY id) - 1 AS item_index
             FROM prices) p
       JOIN observations o ON o.id = p.observation_id
       LEFT JOIN markets m ON m.id = o.market_id
       WHERE ${where.join(" AND ")}
       ORDER BY o.captured_at DESC, o.id, p.item_index
       LIMIT ?`,
    )
    .all(...args) as unknown as FeedRow[];

  return rows.map((r) => ({
    id: `${r.observation_id}-${r.item_index}`,
    observation_id: r.observation_id,
    contributor: r.contributor,
    item: r.item,
    price: r.price,
    currency: r.currency,
    unit: r.unit,
    market: r.market,
    lat: r.lat,
    lon: r.lon,
    captured_at: new Date(r.captured_at).toISOString(),
    nonce: null,
    image_hash: r.image_hash,
    confidence: r.confidence,
    status: "verified",
    reason: null,
    payout_tx: r.payout_tx,
    explorer_url: r.payout_tx ? txUrl(r.payout_tx) : null,
  }));
}

/** verified: verified observations. usdcPaid: 0.05 per landed payout. blocked: rejected observations. */
export function getStats(): StatsResponse {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'verified') AS verified,
         COUNT(*) FILTER (WHERE payout_tx IS NOT NULL) AS paid,
         COUNT(*) FILTER (WHERE status = 'rejected') AS blocked
       FROM observations`,
    )
    .get() as { verified: number; paid: number; blocked: number };
  return {
    verified: Number(row.verified),
    usdcPaid: Math.round(Number(row.paid) * PAYOUT_USDC * 100) / 100,
    blocked: Number(row.blocked),
  };
}
