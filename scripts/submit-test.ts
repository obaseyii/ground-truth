// T5 end-to-end test against a running server (npm run build && npm start, or npm run dev).
//   1. photo 02 -> verified, with a devnet payout
//   2. photo 04 -> rejected (screen or print)
//   3. photo 02 again -> rejected as a duplicate
// Usage: npx tsx scripts/submit-test.ts [baseUrl]   (default http://localhost:3000)
// Before posting, it deletes earlier observations of these two photos from the local
// data/gt.db so the test can run more than once. Never prints secret keys.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@solana/web3.js";
import { DUPLICATE_REASON, dHash, findNearDuplicate } from "../lib/checks";
import { dbPath, deleteObservations, listMarkets, recentImageHashes } from "../lib/db";
import { SubmitResponse, NonceResponse } from "../lib/types";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PHOTOS = resolve(__dirname, "../eval/photos");

async function getNonce(wallet: string): Promise<string> {
  const res = await fetch(`${BASE}/api/nonce`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) throw new Error(`/api/nonce returned ${res.status}: ${await res.text()}`);
  return NonceResponse.parse(await res.json()).nonce;
}

async function submit(file: string, wallet: string, marketId: string): Promise<SubmitResponse> {
  const nonce = await getNonce(wallet);
  const form = new FormData();
  form.set("image", new Blob([readFileSync(resolve(PHOTOS, file))], { type: "image/jpeg" }), file);
  form.set("nonce", nonce);
  form.set("wallet", wallet);
  form.set("marketId", marketId);
  const started = Date.now();
  const res = await fetch(`${BASE}/api/submit`, { method: "POST", body: form });
  const body = await res.json();
  console.log(`\nPOST ${file}  HTTP ${res.status}  ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(JSON.stringify(body, null, 2));
  if (!res.ok) throw new Error(`/api/submit returned ${res.status}`);
  return SubmitResponse.parse(body);
}

async function resetPhotos(files: string[]) {
  const hashes = await Promise.all(files.map((f) => dHash(readFileSync(resolve(PHOTOS, f)))));
  const rows = recentImageHashes(0);
  const ids = rows.filter((r) => hashes.some((h) => findNearDuplicate(h, [r]))).map((r) => r.id);
  const n = deleteObservations(ids);
  console.log(`Reset: removed ${n} earlier observation(s) of ${files.join(", ")} from ${dbPath()}`);
}

async function main() {
  const market = listMarkets()[0];
  if (!market) throw new Error("No markets in the database. Run npm run seed-markets first");
  await resetPhotos(["02.jpeg", "04.jpeg"]);

  const wallet = Keypair.generate().publicKey.toBase58();
  console.log(`Server: ${BASE}\nWallet: ${wallet} (fresh)\nMarket: ${market.id}`);

  const results: [string, boolean][] = [];

  const first = await submit("02.jpeg", wallet, market.id);
  results.push(["02 is verified with a payout", first.status === "verified" && !!first.payoutTx]);

  const spoof = await submit("04.jpeg", wallet, market.id);
  results.push(["04 is rejected with a reason", spoof.status === "rejected" && !!spoof.reason]);

  const again = await submit("02.jpeg", wallet, market.id);
  results.push(["02 again is rejected as a duplicate", again.status === "rejected" && again.reason === DUPLICATE_REASON]);

  console.log("\n=== Results ===");
  for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (results.some(([, ok]) => !ok)) process.exit(1);
}

main().catch((err) => {
  console.error(`submit-test failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
