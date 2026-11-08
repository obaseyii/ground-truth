// T1: create the mock USDC mint on devnet and fund the treasury and agent wallets.
// Usage: npm run mint
// Prints public addresses, signatures, and explorer links only. Never prints secret keys.
// Does not write to .env.local: copy the printed mint address into USDC_MINT yourself.
import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { getEnv } from "../lib/env";

const DECIMALS = 6;
const TREASURY_TOKENS = BigInt(10_000);
const AGENT_TOKENS = BigInt(50);
const AGENT_SOL = 0.2;
const BASE = BigInt(10) ** BigInt(DECIMALS);

const explorer = (kind: "address" | "tx", value: string) =>
  `https://explorer.solana.com/${kind}/${value}?cluster=devnet`;

function loadKeypair(path: string | undefined, name: string): Keypair {
  if (!path) throw new Error(`${name} is not set in .env.local`);
  try {
    const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  } catch {
    // Do not include file contents in the error.
    throw new Error(`Could not load keypair from ${name}`);
  }
}

async function main() {
  const env = getEnv();
  const rpc = env.SOLANA_RPC_URL;
  if (!/devnet/i.test(rpc)) throw new Error("SOLANA_RPC_URL must be a devnet endpoint");

  const treasury = loadKeypair(env.TREASURY_KEYPAIR_PATH, "TREASURY_KEYPAIR_PATH");
  const agent = loadKeypair(env.AGENT_KEYPAIR_PATH, "AGENT_KEYPAIR_PATH");
  const connection = new Connection(rpc, "confirmed");

  const sol = (await connection.getBalance(treasury.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`Treasury:            ${treasury.publicKey.toBase58()} (${sol} SOL)`);
  console.log(`Agent:               ${agent.publicKey.toBase58()}`);
  if (sol < AGENT_SOL + 0.05) {
    throw new Error(`Treasury needs at least ${AGENT_SOL + 0.05} SOL. Fund it at faucet.solana.com`);
  }

  // 1. Mint with 6 decimals; treasury is mint authority and fee payer, no freeze authority.
  const mint: PublicKey = await createMint(connection, treasury, treasury.publicKey, null, DECIMALS);
  console.log(`\nMint created:        ${mint.toBase58()}`);

  // 2. Treasury token account + 10,000 tokens.
  const treasuryAta = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
  const treasuryMintSig = await mintTo(
    connection, treasury, mint, treasuryAta.address, treasury, TREASURY_TOKENS * BASE,
  );
  console.log(`Treasury token acct: ${treasuryAta.address.toBase58()}`);
  console.log(`Minted ${TREASURY_TOKENS} to treasury: ${treasuryMintSig}`);

  // 3. Agent token account (treasury pays rent) + 50 tokens.
  const agentAta = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, agent.publicKey);
  const agentMintSig = await mintTo(connection, treasury, mint, agentAta.address, treasury, AGENT_TOKENS * BASE);
  console.log(`Agent token acct:    ${agentAta.address.toBase58()}`);
  console.log(`Minted ${AGENT_TOKENS} to agent:     ${agentMintSig}`);

  // 4. 0.2 SOL from treasury to agent so it can pay its own query fees.
  const solTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: agent.publicKey,
      lamports: Math.round(AGENT_SOL * LAMPORTS_PER_SOL),
    }),
  );
  const solSig = await sendAndConfirmTransaction(connection, solTx, [treasury], { commitment: "confirmed" });
  console.log(`Sent ${AGENT_SOL} SOL to agent:     ${solSig}`);

  const [treasuryBal, agentBal, agentSol] = await Promise.all([
    connection.getTokenAccountBalance(treasuryAta.address),
    connection.getTokenAccountBalance(agentAta.address),
    connection.getBalance(agent.publicKey),
  ]);

  console.log("\n=== Result ===");
  console.log(`USDC_MINT=${mint.toBase58()}`);
  console.log(`Treasury balance: ${treasuryBal.value.uiAmountString} mock USDC`);
  console.log(`Agent balance:    ${agentBal.value.uiAmountString} mock USDC, ${agentSol / LAMPORTS_PER_SOL} SOL`);
  console.log("\nExplorer links (devnet):");
  console.log(`  Mint:                ${explorer("address", mint.toBase58())}`);
  console.log(`  Treasury token acct: ${explorer("address", treasuryAta.address.toBase58())}`);
  console.log(`  Agent token acct:    ${explorer("address", agentAta.address.toBase58())}`);
  console.log(`  Treasury mint tx:    ${explorer("tx", treasuryMintSig)}`);
  console.log(`  Agent mint tx:       ${explorer("tx", agentMintSig)}`);
  console.log(`  Agent SOL tx:        ${explorer("tx", solSig)}`);
  console.log("\nNext: set USDC_MINT in .env.local to the mint address above (this script does not edit it).");
}

main().catch((err) => {
  console.error(`mint-usdc failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
