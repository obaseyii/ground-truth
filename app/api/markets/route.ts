import { USE_FIXTURES } from "@/lib/config";
import { notImplemented } from "@/lib/api";
import { MarketsResponse } from "@/lib/types";
import fixture from "@/fixtures/markets.json";

export async function GET() {
  if (!USE_FIXTURES) return notImplemented();
  return Response.json(MarketsResponse.parse(fixture));
}
