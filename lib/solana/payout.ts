// Contributor payouts: mock USDC from the treasury to a contributor wallet on devnet.
// The treasury pays every fee and the rent for the recipient's token account,
// so the recipient never needs SOL.
import { readFileSync } from "node:fs";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { getEnv } from "../env";

export const USDC_DECIMALS = 6;

// SPL Memo program v2. Not bundled in @solana/spl-token, so the id is set here.
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// Priority fee in micro-lamports per compute unit. Small; devnet only.
const COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 10_000;

export interface PayContributorArgs {
  recipient: string;
  observationId: string;
  imageHash: string;
  amountBase: bigint;
}

let treasuryCache: Keypair | undefined;

/** Loads the treasury from TREASURY_SECRET_KEY (Vercel) or TREASURY_KEYPAIR_PATH (local). */
export function loadTreasury(): Keypair {
  if (treasuryCache) return treasuryCache;
  const env = getEnv();
  let source: string;
  let raw: string;
  if (env.TREASURY_SECRET_KEY) {
    source = "TREASURY_SECRET_KEY";
    raw = env.TREASURY_SECRET_KEY;
  } else if (env.TREASURY_KEYPAIR_PATH) {
    source = "TREASURY_KEYPAIR_PATH";
    try {
      raw = readFileSync(env.TREASURY_KEYPAIR_PATH, "utf8");
    } catch {
      throw new Error("Could not read the treasury keypair file at TREASURY_KEYPAIR_PATH");
    }
  } else {
    throw new Error("Set TREASURY_SECRET_KEY or TREASURY_KEYPAIR_PATH");
  }
  try {
    const secret = JSON.parse(raw) as number[];
    treasuryCache = Keypair.fromSecretKey(Uint8Array.from(secret));
  } catch {
    // Never include key material in the error.
    throw new Error(`Could not parse the treasury keypair from ${source}`);
  }
  return treasuryCache;
}

export function getConnection(): Connection {
  const { SOLANA_RPC_URL } = getEnv();
  // getEnv already rejects mainnet URLs; this is a second guard for rule 1.
  if (/mainnet/i.test(SOLANA_RPC_URL)) throw new Error("Refusing to use a mainnet RPC endpoint");
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

export function memoText(observationId: string, imageHash: string): string {
  return `gt:${observationId}:${imageHash}`;
}

function memoInstruction(text: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, "utf8"),
  });
}

/**
 * Pays a contributor in mock USDC. The treasury is the fee payer, creates the
 * recipient's token account if missing, and adds the memo gt:<observationId>:<imageHash>.
 * Confirms at "confirmed" and retries once if the blockhash expires.
 */
export async function payContributor({
  recipient,
  observationId,
  imageHash,
  amountBase,
}: PayContributorArgs): Promise<{ signature: string }> {
  if (amountBase <= BigInt(0)) throw new Error("amountBase must be positive");

  let recipientKey: PublicKey;
  try {
    recipientKey = new PublicKey(recipient);
  } catch {
    throw new Error("Recipient is not a valid Solana address");
  }

  const env = getEnv("USDC_MINT");
  const mint = new PublicKey(env.USDC_MINT);
  const treasury = loadTreasury();
  const connection = getConnection();

  const sourceAta = getAssociatedTokenAddressSync(mint, treasury.publicKey);
  const destAta = getAssociatedTokenAddressSync(mint, recipientKey);

  const buildTx = () =>
    new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE_MICRO_LAMPORTS }),
      // Treasury pays rent; no-op if the account already exists.
      createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, destAta, recipientKey, mint),
      createTransferCheckedInstruction(sourceAta, mint, destAta, treasury.publicKey, amountBase, USDC_DECIMALS),
      memoInstruction(memoText(observationId, imageHash), treasury.publicKey),
    );

  // sendAndConfirmTransaction fetches a fresh blockhash and sets the first signer
  // (the treasury) as fee payer. An expired transaction can never land, so one
  // retry with a new blockhash cannot double pay.
  for (let attempt = 1; ; attempt++) {
    try {
      const signature = await sendAndConfirmTransaction(connection, buildTx(), [treasury], {
        commitment: "confirmed",
      });
      return { signature };
    } catch (err) {
      if (attempt === 1 && err instanceof TransactionExpiredBlockheightExceededError) continue;
      throw err;
    }
  }
}
