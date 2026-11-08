import { USE_FIXTURES } from "@/lib/config";
import { notImplemented } from "@/lib/api";
import { StatsResponse } from "@/lib/types";
import fixture from "@/fixtures/stats.json";

export async function GET() {
  if (!USE_FIXTURES) return notImplemented();
  return Response.json(StatsResponse.parse(fixture));
}
