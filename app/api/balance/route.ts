// GET /api/balance?wallet= -> the wallet's mock USDC balance, read from devnet.
// Served by the server because USDC_MINT and SOLANA_RPC_URL are server-side settings.
import { connection } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { isWallet, jsonError } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { getConnection, USDC_DECIMALS } from "@/lib/solana/payout";
import { BalanceResponse } from "@/lib/types";

export async function GET(request: Request) {
  await connection();
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim() ?? "";
  if (!isWallet(wallet)) return jsonError("Missing or invalid wallet parameter", 400);

  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet);
  } catch {
    return jsonError("Missing or invalid wallet parameter", 400);
  }

  try {
    const mint = new PublicKey(getEnv("USDC_MINT").USDC_MINT);
    const ata = getAssociatedTokenAddressSync(mint, owner);
    const conn = getConnection();
    const info = await conn.getAccountInfo(ata, "confirmed");
    // No token account yet means the wallet has never been paid.
    let baseUnits = BigInt(0);
    if (info) baseUnits = BigInt((await conn.getTokenAccountBalance(ata, "confirmed")).value.amount);
    const usdc = Number(baseUnits) / 10 ** USDC_DECIMALS;
    return Response.json(BalanceResponse.parse({ wallet, usdc, baseUnits: baseUnits.toString() }));
  } catch (err) {
    console.error("balance: devnet read failed", err);
    return jsonError("Could not read the balance from devnet", 502);
  }
}
