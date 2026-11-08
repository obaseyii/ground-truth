import { getDb } from "./client";

export const NONCE_TTL_SECONDS = 120;

export function createNonce(nonce: string, wallet: string, now = Date.now()): void {
  getDb().prepare("INSERT INTO nonces (nonce, wallet, created_at) VALUES (?, ?, ?)").run(nonce, wallet, now);
}

export type ConsumeNonceResult =
  | { ok: true }
  | { ok: false; problem: "unknown" | "wrong_wallet" | "used" | "expired" };

/**
 * Marks the nonce used if it exists, belongs to wallet, is unused, and is younger than
 * NONCE_TTL_SECONDS. The check and the mark are one UPDATE, so a nonce is consumed at most once.
 */
export function consumeNonce(nonce: string, wallet: string, now = Date.now()): ConsumeNonceResult {
  const db = getDb();
  const minCreated = now - NONCE_TTL_SECONDS * 1000;
  const updated = db
    .prepare(
      `UPDATE nonces SET used_at = ?
       WHERE nonce = ? AND wallet = ? AND used_at IS NULL AND created_at > ?`,
    )
    .run(now, nonce, wallet, minCreated);
  if (Number(updated.changes) === 1) return { ok: true };

  const row = db.prepare("SELECT wallet, created_at, used_at FROM nonces WHERE nonce = ?").get(nonce) as
    | { wallet: string; created_at: number; used_at: number | null }
    | undefined;
  if (!row) return { ok: false, problem: "unknown" };
  if (row.wallet !== wallet) return { ok: false, problem: "wrong_wallet" };
  if (row.used_at !== null) return { ok: false, problem: "used" };
  return { ok: false, problem: "expired" };
}
