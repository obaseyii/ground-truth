import { connection } from "next/server";
import { USE_FIXTURES } from "@/lib/config";
import { notImplemented } from "@/lib/api";
import { ItemsResponse } from "@/lib/types";
import fixture from "@/fixtures/items.json";

export async function GET() {
  await connection(); // run at request time, never prerendered (cacheComponents is on)
  if (!USE_FIXTURES) return notImplemented();
  return Response.json(ItemsResponse.parse(fixture));
}
