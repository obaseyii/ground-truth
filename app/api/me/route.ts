import type { NextRequest } from "next/server";
import { USE_FIXTURES } from "@/lib/config";
import { isWallet, jsonError, notImplemented } from "@/lib/api";
import { MeResponse } from "@/lib/types";
import fixture from "@/fixtures/me.json";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet) return jsonError("Missing wallet parameter", 400);
  if (!isWallet(wallet)) return jsonError("Wallet is not a valid Solana address", 400);
  if (!USE_FIXTURES) return notImplemented();
  // Fixture mode: every valid wallet sees the same sample history under its own address.
  return Response.json(MeResponse.parse({ ...fixture, wallet }));
}
