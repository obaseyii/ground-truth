import type { ApiError } from "./types";

/** JSON error response with the contract's { error } shape. */
export function jsonError(error: string, status: number): Response {
  return Response.json({ error } satisfies ApiError, { status });
}

/** Returned while USE_FIXTURES is false and the real query is not written yet. */
export function notImplemented(): Response {
  return jsonError("Live data is not wired up yet. Set USE_FIXTURES=true.", 501);
}

const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function isWallet(value: string): boolean {
  return BASE58_PUBKEY.test(value);
}
