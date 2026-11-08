import { USE_FIXTURES } from "@/lib/config";
import { notImplemented } from "@/lib/api";
import { ItemsResponse } from "@/lib/types";
import fixture from "@/fixtures/items.json";

export async function GET() {
  if (!USE_FIXTURES) return notImplemented();
  return Response.json(ItemsResponse.parse(fixture));
}
