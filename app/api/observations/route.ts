// GET /api/observations: public feed of verified prices, one record per extracted item.
// Reads SQLite regardless of USE_FIXTURES. CORS open for the public website.
import { connection, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { listFeed } from "@/lib/db";
import { ObservationsResponse } from "@/lib/types";

export async function GET(request: NextRequest) {
  await connection(); // run at request time, never prerendered (cacheComponents is on)
  const params = request.nextUrl.searchParams;
  const item = params.get("item")?.trim() || undefined;
  const market = params.get("market")?.trim() || undefined;
  try {
    return withCors(Response.json(ObservationsResponse.parse(listFeed({ item, market }))));
  } catch (err) {
    console.error("observations: could not read feed", err);
    return withCors(jsonError("Could not load observations", 500));
  }
}

export function OPTIONS() {
  return corsPreflight();
}
