// Stub for the frontend. The backend replaces this file in T5.
import { USE_FIXTURES } from "@/lib/config";
import { isWallet, jsonError, notImplemented } from "@/lib/api";
import { NonceRequest, NonceResponse } from "@/lib/types";
import fixture from "@/fixtures/nonce.json";

export async function POST(request: Request) {
  const body = NonceRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("Body must be JSON: { wallet }", 400);
  if (!isWallet(body.data.wallet)) return jsonError("Wallet is not a valid Solana address", 400);
  if (!USE_FIXTURES) return notImplemented();
  return Response.json(NonceResponse.parse(fixture));
}
