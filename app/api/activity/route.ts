import { connection } from "next/server";
import { USE_FIXTURES } from "@/lib/config";
import { notImplemented } from "@/lib/api";
import { ActivityResponse } from "@/lib/types";
import fixture from "@/fixtures/activity.json";

export async function GET() {
  await connection(); // run at request time, never prerendered (cacheComponents is on)
  if (!USE_FIXTURES) return notImplemented();
  return Response.json(ActivityResponse.parse(fixture.slice(0, 20)));
}
