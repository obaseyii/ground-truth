// CORS for the public read-only routes (observations, markets, stats).
// Do not use on nonce, submit, or balance.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/** Copies the response with the CORS headers added. */
export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** Preflight response for an OPTIONS handler. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" } });
}
