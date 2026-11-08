// POST /api/nonce  body { wallet } -> { nonce, expiresInSeconds: 120 }
import { randomBytes } from "node:crypto";
import { isWallet, jsonError } from "@/lib/api";
import { createNonce, NONCE_TTL_SECONDS } from "@/lib/db";
import { NonceRequest, NonceResponse } from "@/lib/types";

export async function POST(request: Request) {
  const body = NonceRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("Body must be JSON: { wallet }", 400);
  const wallet = body.data.wallet.trim();
  if (!isWallet(wallet)) return jsonError("Wallet is not a valid Solana address", 400);

  const nonce = randomBytes(16).toString("hex");
  try {
    createNonce(nonce, wallet);
  } catch (err) {
    console.error("nonce: could not store nonce", err);
    return jsonError("Could not start a capture session, please try again", 500);
  }
  return Response.json(NonceResponse.parse({ nonce, expiresInSeconds: NONCE_TTL_SECONDS }));
}
