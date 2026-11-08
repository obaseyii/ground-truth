import { connection } from "next/server";
import { USE_FIXTURES } from "@/lib/config";
import { notImplemented } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { StatsResponse } from "@/lib/types";
import fixture from "@/fixtures/stats.json";

export async function GET() {
  await connection(); // run at request time, never prerendered (cacheComponents is on)
  if (!USE_FIXTURES) return withCors(notImplemented());
  return withCors(Response.json(StatsResponse.parse(fixture)));
}

export function OPTIONS() {
  return corsPreflight();
}
