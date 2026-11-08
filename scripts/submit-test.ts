// End-to-end submit test on a private server and a throwaway database.
// It never touches data/gt.db or a dev server you are running.
//
// Usage: npm run build && npm run submit-test
//
// Steps: start `next start` on TEST_PORT with GT_DB_PATH=data/test.db (deleted first), seed
// markets into it, then:
//   1. photo 02 -> verified, with a devnet payout (one real devnet transfer per run)
//   2. photo 04 -> rejected (screen)
//   3. photo 02 again -> rejected as a duplicate
//   4. photo 04 again -> rejected for the screen again, not as a duplicate (rejected photos
//      never block a retake)
//   5. the stored observation for step 1 has image width, height, and byte size
// Never prints secret keys.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { Keypair } from "@solana/web3.js";
import { z } from "zod";

const TEST_PORT = 3100;
const BASE = `http://localhost:${TEST_PORT}`;
const ROOT = resolve(__dirname, "..");
const PHOTOS = join(ROOT, "eval/photos");
const TEST_DB = join(ROOT, "data/test.db");

// Must be set before lib/db opens the database (it opens lazily on first use).
process.env.GT_DB_PATH = TEST_DB;

async function main() {
  if (!existsSync(join(ROOT, ".next/BUILD_ID"))) throw new Error("No production build. Run npm run build first");
  for (const suffix of ["", "-wal", "-shm"]) rmSync(TEST_DB + suffix, { force: true });

  const { getObservation, listMarkets, upsertMarket } = await import("../lib/db");
  const { DUPLICATE_REASON } = await import("../lib/checks");
  const { Market, NonceResponse, SubmitResponse } = await import("../lib/types");

  const markets = z.array(Market).parse(JSON.parse(readFileSync(join(__dirname, "markets.json"), "utf8")));
  for (const m of markets) upsertMarket(m);
  const market = listMarkets()[0];

  const server = await startServer();
  try {
    const wallet = Keypair.generate().publicKey.toBase58();
    console.log(`Server: ${BASE} (private)\nDB:     ${TEST_DB} (fresh)\nWallet: ${wallet} (fresh)\nMarket: ${market.id}`);

    const submit = async (file: string) => {
      const nonceRes = await fetch(`${BASE}/api/nonce`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      if (!nonceRes.ok) throw new Error(`/api/nonce returned ${nonceRes.status}: ${await nonceRes.text()}`);
      const { nonce } = NonceResponse.parse(await nonceRes.json());
      const form = new FormData();
      form.set("image", new Blob([readFileSync(join(PHOTOS, file))], { type: "image/jpeg" }), file);
      form.set("nonce", nonce);
      form.set("wallet", wallet);
      form.set("marketId", market.id);
      const started = Date.now();
      const res = await fetch(`${BASE}/api/submit`, { method: "POST", body: form });
      const body = await res.json();
      console.log(`\nPOST ${file}  HTTP ${res.status}  ${((Date.now() - started) / 1000).toFixed(1)} s`);
      console.log(JSON.stringify(body, null, 2));
      if (!res.ok) throw new Error(`/api/submit returned ${res.status}`);
      return SubmitResponse.parse(body);
    };

    const results: [string, boolean][] = [];

    const first = await submit("02.jpeg");
    results.push(["02 is verified with a payout", first.status === "verified" && !!first.payoutTx]);

    const spoof = await submit("04.jpeg");
    results.push(["04 is rejected with a reason", spoof.status === "rejected" && !!spoof.reason]);

    const again = await submit("02.jpeg");
    results.push(["02 again is rejected as a duplicate", again.status === "rejected" && again.reason === DUPLICATE_REASON]);

    const spoofAgain = await submit("04.jpeg");
    results.push([
      "04 again is judged again, not called a duplicate",
      spoofAgain.status === "rejected" && !!spoofAgain.reason && spoofAgain.reason !== DUPLICATE_REASON,
    ]);

    const row = getObservation(first.observationId);
    const bytes = readFileSync(join(PHOTOS, "02.jpeg")).length;
    console.log(`\nStored for ${first.observationId}: ${row?.image_width}x${row?.image_height}, ${row?.image_bytes} bytes`);
    results.push([
      "02 row stores width, height, and byte size",
      !!row && (row.image_width ?? 0) > 0 && (row.image_height ?? 0) > 0 && row.image_bytes === bytes,
    ]);

    console.log("\n=== Results ===");
    for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    if (results.some(([, ok]) => !ok)) process.exitCode = 1;
  } finally {
    stopServer(server);
  }
}

async function startServer(): Promise<ChildProcess> {
  const child = spawn(join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(TEST_PORT)], {
    cwd: ROOT,
    env: { ...process.env, GT_DB_PATH: TEST_DB },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group, so stopServer can stop all of it
  });
  let log = "";
  child.stdout?.on("data", (d) => (log += d));
  child.stderr?.on("data", (d) => (log += d));
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`Test server exited:\n${log}`);
    try {
      if ((await fetch(`${BASE}/api/markets`)).ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  stopServer(child);
  throw new Error(`Test server did not start on port ${TEST_PORT}:\n${log}`);
}

function stopServer(child: ChildProcess) {
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  } catch {}
}

main().catch((err) => {
  console.error(`submit-test failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
