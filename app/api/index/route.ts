import type { NextRequest } from "next/server";
import { USE_FIXTURES } from "@/lib/config";
import { jsonError, notImplemented } from "@/lib/api";
import { IndexResponse } from "@/lib/types";
import fixture from "@/fixtures/index.json";

const byItem: Record<string, unknown> = fixture;

export async function GET(request: NextRequest) {
  const item = request.nextUrl.searchParams.get("item")?.trim().toLowerCase();
  if (!item) return jsonError("Missing item parameter, for example ?item=tomato", 400);
  if (!USE_FIXTURES) return notImplemented();
  // Unknown items return an empty market list, not an error.
  return Response.json(IndexResponse.parse(byItem[item] ?? { item, markets: [] }));
}
