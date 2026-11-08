// T2: pay a brand new zero-SOL wallet 0.05 mock USDC from the treasury.
// Usage: npm run payout-test
// Prints public addresses, the signature, explorer links, and balances. Never prints secret keys.
import { randomUUID } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getEnv } from "../lib/env";
import { getConnection, loadTreasury, memoText, payContributor, USDC_DECIMALS } from "../lib/solana/payout";
import { addressUrl, txUrl } from "../lib/solana/explorer";

const AMOUNT_BASE = BigInt(50_000); // 0.05 USDC

async function main() {
  const env = getEnv("USDC_MINT");
  const connection = getConnection();
  const treasury = loadTreasury();
  const mint = new PublicKey(env.USDC_MINT);

  const recipient = Keypair.generate().publicKey;
  const solBefore = await connection.getBalance(recipient);
  console.log(`Treasury:   ${treasury.publicKey.toBase58()}`);
  console.log(`Recipient:  ${recipient.toBase58()} (fresh wallet, ${solBefore} lamports SOL)`);

  const observationId = `test-${randomUUID()}`;
  const imageHash = "0000000000000000";
  console.log(`Memo:       ${memoText(observationId, imageHash)}`);

  const { signature } = await payContributor({
    recipient: recipient.toBase58(),
    observationId,
    imageHash,
    amountBase: AMOUNT_BASE,
  });

  const ata = getAssociatedTokenAddressSync(mint, recipient);
  const [account, solAfter] = await Promise.all([
    getAccount(connection, ata, "confirmed"),
    connection.getBalance(recipient),
  ]);
  const ui = Number(account.amount) / 10 ** USDC_DECIMALS;

  console.log("\n=== Result ===");
  console.log(`Signature:          ${signature}`);
  console.log(`Explorer:           ${txUrl(signature)}`);
  console.log(`Recipient balance:  ${ui} mock USDC (${account.amount} base units)`);
  console.log(`Recipient SOL:      ${solAfter} lamports (treasury paid all fees)`);
  console.log(`Recipient account:  ${addressUrl(ata.toBase58())}`);

  if (account.amount !== AMOUNT_BASE) throw new Error(`Expected ${AMOUNT_BASE} base units`);
}

main().catch((err) => {
  console.error(`payout-test failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
