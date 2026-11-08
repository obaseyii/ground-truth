import { connection } from "next/server";
import { USE_FIXTURES } from "@/lib/config";
import { notImplemented } from "@/lib/api";
import { MarketsResponse } from "@/lib/types";
import fixture from "@/fixtures/markets.json";

export async function GET() {
  await connection(); // run at request time, never prerendered (cacheComponents is on)
  if (!USE_FIXTURES) return notImplemented();
  return Response.json(MarketsResponse.parse(fixture));
}
