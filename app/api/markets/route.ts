// GET /api/markets reads from SQLite (seeded by npm run seed-markets), regardless of USE_FIXTURES.
import { connection } from "next/server";
import { jsonError } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { listMarkets } from "@/lib/db";
import { MarketsResponse } from "@/lib/types";

export async function GET() {
  await connection(); // run at request time, never prerendered (cacheComponents is on)
  try {
    return withCors(Response.json(MarketsResponse.parse(listMarkets())));
  } catch (err) {
    console.error("markets: could not read markets", err);
    return withCors(jsonError("Could not load markets", 500));
  }
}

export function OPTIONS() {
  return corsPreflight();
}
