# Ground Truth: Claude Code Build Plan

Put this file and CLAUDE.md at the root of ~/ground-truth. Claude Code reads both.

How to use this plan:
1. One task per Claude Code session. Start each session from the repo root with `claude`.
2. Paste the task prompt. For tasks marked BIG, ask Claude Code to show its plan before editing.
3. Check the acceptance list yourself. Do not move on until every item passes.
4. Commit on the task branch, push, open a PR, merge to main. Vercel deploys main.
5. If Claude Code gets stuck on the same error three times, stop, paste the error to the team, and decide together.

Owners: ML, BE (backend), FE (frontend), LEAD. Tasks with the same phase run in parallel.

---

## Part 0. Manual setup (LEAD, 30 minutes, before any Claude Code task)

Accounts and keys. Collect these in a private note. Never paste keys into Claude Code chat.
1. Anthropic API key from the Claude Console. Add a small spend limit.
2. Supabase project (free tier). Copy: project URL, anon key, service role key.
3. Vercel account linked to GitHub.
4. GitHub repo named ground-truth, public. Add teammates.

In Ubuntu (WSL):

```bash
mkdir -p ~/ground-truth && cd ~/ground-truth
git init
# copy CLAUDE.md and BUILD_PLAN.md here
solana config set --url devnet
solana-keygen new --no-bip39-passphrase -o ~/gt-keys/treasury.json
solana-keygen new --no-bip39-passphrase -o ~/gt-keys/agent.json
solana address -k ~/gt-keys/treasury.json
```

Keys live in ~/gt-keys, outside the repo. Fund the treasury with devnet SOL from faucet.solana.com (2 to 5 SOL). The CLI airdrop is rate limited.

Create .env.local (Claude Code fills in the mint later):

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SOLANA_RPC_URL=https://api.devnet.solana.com
TREASURY_KEYPAIR_PATH=/home/<you>/gt-keys/treasury.json
TREASURY_SECRET_KEY=        # JSON array, used on Vercel only
AGENT_KEYPAIR_PATH=/home/<you>/gt-keys/agent.json
USDC_MINT=
ADMIN_KEY=                  # any long random string
VISION_MODEL=claude-sonnet-5-5
```

Confirm the model string in the Claude API docs (docs.claude.com) before the first vision call.

---

## Phase 1. Gate (first 2 hours)

### T0. Scaffold (BE, 20 min)

```
Read CLAUDE.md. Scaffold the project in the current folder:
- Next.js with TypeScript, App Router, Tailwind, ESLint, src directory off.
- Install: @solana/web3.js (v1), @solana/spl-token, @anthropic-ai/sdk, @supabase/supabase-js,
  sharp, zod, react-leaflet, leaflet, vitest, tsx, dotenv.
- Create the folders listed in CLAUDE.md with an index.ts in each lib folder.
- Add .gitignore entries: .env*, *.json keypairs, node_modules, .next, eval/photos.
- Add npm scripts: dev, build, test (vitest run), eval (tsx scripts/eval.ts),
  mint (tsx scripts/mint-usdc.ts), payout-test (tsx scripts/payout-test.ts).
- Add lib/env.ts that loads and validates every variable in .env.local with zod
  and throws a clear message naming any missing variable.
Run npm run build and show me the output.
```

Accept:
- [ ] npm run build passes
- [ ] git status shows no .env.local and no keypair files

### T1. Mock USDC and treasury (BE, 20 min)

```
Read CLAUDE.md. Write scripts/mint-usdc.ts:
- Load the treasury keypair from TREASURY_KEYPAIR_PATH.
- Connect to SOLANA_RPC_URL (devnet).
- Create a new SPL mint with 6 decimals, mint authority = treasury.
- Create the treasury's associated token account and mint 10,000 tokens to it.
- Print the mint address, the treasury token account, and explorer links
  (explorer.solana.com with ?cluster=devnet).
- Also mint 50 tokens to the agent wallet from AGENT_KEYPAIR_PATH and send it 0.2 SOL
  from the treasury, so the agent pays its own query fees.
Run it, then add the mint to .env.local as USDC_MINT. Show me the output.
```

Accept:
- [ ] Explorer shows the treasury holding 10,000 mock USDC
- [ ] USDC_MINT set in .env.local

### T2. Payout library (BE, 40 min) GATE

```
Read CLAUDE.md. Build lib/solana/payout.ts with:
  payContributor({ recipient: string, observationId: string, imageHash: string, amountBase: bigint })
  -> { signature: string }
Rules:
- The treasury is the fee payer. The recipient never needs SOL.
- Create the recipient's associated token account if missing (idempotent create, paid by the treasury).
- Use transferChecked with USDC_MINT and 6 decimals.
- Add a Memo program instruction with the text gt:<observationId>:<imageHash>.
- Add a compute unit price instruction for faster landing.
- Confirm at "confirmed" commitment, retry once on blockhash expiry.
- Load the treasury from TREASURY_SECRET_KEY when set (Vercel), else TREASURY_KEYPAIR_PATH.
Also write lib/solana/explorer.ts with txUrl(sig) and addressUrl(addr) for devnet.
Write scripts/payout-test.ts: generate a fresh wallet with zero SOL, pay it 0.05 USDC
(50000 base units), print the signature, the explorer link, and the new token balance.
Check function names against the installed package types before using them.
Run npm run payout-test and show me the output.
```

Accept:
- [ ] A brand new wallet with zero SOL receives 0.05 mock USDC
- [ ] Explorer shows the memo on the transaction

### T3. Vision extraction and eval set (ML, 90 min) GATE, BIG

Before this task, the ML owner takes 20 photos: printed price lists, shelf tags, receipts, handwritten signs, plus 4 photos of a laptop screen showing a price board and 2 photos of a printed photo. Put them in eval/photos/ and write eval/expected.json:

```json
[
  { "file": "01.jpg", "direct": true, "items": [{ "item": "tomato", "price": 2.99, "currency": "USD", "unit": "lb" }] },
  { "file": "17.jpg", "direct": false, "items": [] }
]
```

```
Read CLAUDE.md. Build lib/vision/extract.ts:
  extractPrices(image: Buffer, mimeType: string) -> ExtractResult
Use the Anthropic SDK with model from VISION_MODEL. Send the image as a base64 image block.
Force a single tool call (tool_choice) to a tool named record_prices with this input schema:
{
  is_direct_photo: boolean,        // false for photos of screens, monitors, phones, or printed photos
  spoof_reason: string | null,     // short reason when is_direct_photo is false
  items: [{
    item: string,                  // canonical, lowercase, singular, English: "tomato", "rice", "palm oil"
    raw_label: string,             // the text as printed
    price: number,
    currency: string,              // ISO 4217, infer from symbols and context
    unit: string                   // "kg", "lb", "each", "basket", "bunch", "l"
  }],
  confidence: number               // 0 to 1, overall legibility and certainty
}
Validate the tool input with zod. On a validation failure, retry once, then throw.
The system prompt must tell the model: read only prices visible in the image, never guess,
return an empty items list when nothing is legible, and look for screen glare, pixel grids,
moire patterns, bezels, and paper edges when judging is_direct_photo.
Keep the prompt in lib/vision/prompt.ts so ML can edit it alone.
Resize images with sharp to max 1600 px on the long side, JPEG quality 85, before sending.

Write scripts/eval.ts: run extractPrices on every file in eval/expected.json and score:
- item+price correct: an expected item matches an extracted item with the same canonical
  name and a price within 1 percent
- direct-photo correct: is_direct_photo equals expected.direct
Print a table per file and totals. Exit code 1 if fewer than 16 of 20 files pass both.
Run npm run eval and show me the table.
```

Accept:
- [ ] 16 of 20 files pass
- [ ] Every screen photo flagged as not direct
- [ ] If below target: ML edits only lib/vision/prompt.ts and reruns. Two rounds maximum, then decide as a team.

GATE DECISION: Copilot check clear + T2 passes + T3 passes = go. Otherwise stop and regroup.

---

## Phase 2. Core loop (next 4 hours)

### T4. Database and storage (BE, 40 min)

```
Read CLAUDE.md. Create supabase/schema.sql and apply it with the SQL editor instructions
printed at the end (I will paste it into Supabase myself).
Tables:
- markets(id text pk, name text, lat double precision, lon double precision, radius_m int default 150)
- nonces(nonce text pk, wallet text not null, created_at timestamptz default now(), used boolean default false)
- observations(id text pk, contributor text not null, market_id text references markets,
  lat double precision, lon double precision, accuracy_m real, captured_at timestamptz,
  nonce text, image_path text, image_hash text, confidence real,
  status text check (status in ('verified','rejected','review','payout_failed')),
  reason text, payout_tx text, created_at timestamptz default now())
- prices(id bigserial pk, observation_id text references observations, item text, raw_label text,
  price numeric, currency text, unit text, market_id text, outlier boolean default false,
  created_at timestamptz default now())
- query_payments(signature text pk, reference text unique, payer text, amount_base bigint,
  created_at timestamptz default now())
Indexes: prices(item, market_id, created_at), observations(contributor, created_at), observations(image_hash).
Create a public storage bucket named photos.
Write lib/db/client.ts (server client with the service role key, server only) and
lib/db/queries.ts with typed functions for every insert and lookup used in later tasks.
Write scripts/seed-markets.ts that upserts markets from scripts/markets.json.
```

LEAD fills scripts/markets.json with real coordinates of the stores and markets you will photograph, plus three target markets abroad for the map story.

Accept:
- [ ] Tables exist in Supabase
- [ ] npm run seed-markets inserts the markets

### T5. Nonce and submit API (BE, 60 min) BIG

```
Read CLAUDE.md and BUILD_PLAN.md T5. Build two API routes:

POST /api/nonce  body { wallet }
- Validate wallet is a base58 Solana public key.
- Create a random 16-byte hex nonce, store it, return { nonce, expiresInSeconds: 120 }.

POST /api/submit  multipart: image (jpeg), nonce, wallet, lat, lon, accuracy
Pipeline, in order, each step returning { status:'rejected', reason } on failure:
1. Nonce exists, belongs to wallet, unused, younger than 120 s. Mark used.
2. Image under 3 MB, decodes with sharp.
3. Run the checks from lib/checks (stubs for now that always pass; T8 fills them).
4. Upload the image to the photos bucket at <observationId>.jpg.
5. extractPrices(). If is_direct_photo is false: reject with spoof_reason.
   If items is empty: reject "No readable prices found".
   If confidence < 0.7: status review, no payout.
6. Insert the observation and its prices.
7. If verified: payContributor(50000n). Save payout_tx. On failure set payout_failed.
Return { status, reason?, observationId, items, payoutTx?, explorerUrl? }.
Observation ids look like obs_<8 random chars>.
Set the route's maxDuration so a slow vision call does not time out on Vercel.
Write scripts/submit-test.ts that requests a nonce and posts eval/photos/01.jpg
to http://localhost:3000 and prints the JSON result.
```

Accept:
- [ ] submit-test returns verified with items and a devnet payout link
- [ ] Reusing a nonce returns rejected with a reason

### T6. Capture page (FE, 90 min) BIG, runs in parallel with T4 and T5

```
Read CLAUDE.md. Build the contributor app at / (mobile first):
- Wallet step: paste a Solana address or tap "Create a wallet for me", which generates a
  keypair in the browser, stores the secret in localStorage, and shows a backup warning.
  Show the address short form and the mock USDC balance (read from devnet).
- Capture step: open the rear camera with getUserMedia (facingMode environment) in a video
  element. No file input anywhere, so gallery uploads are impossible.
  Request GPS with high accuracy before enabling the shutter. Show accuracy in meters.
  Request a nonce from /api/nonce when the camera opens and again after each submit.
- Shutter: draw the frame to a canvas, scale to max 1600 px, export JPEG quality 0.85,
  POST to /api/submit with the nonce, wallet, lat, lon, accuracy.
- Result card: verified (green, items list, "0.05 USDC paid", explorer link),
  review (amber, "Waiting for review, no payout yet"), rejected (red, the reason in large text).
- Big touch targets, works one handed, readable in sunlight.
Use a mock /api/submit response until T5 merges, behind a flag in lib/config.ts.
```

Accept:
- [ ] Works on a real phone over the Vercel HTTPS URL
- [ ] No way to pick a photo from the gallery

### T7. Deploy and wire (LEAD with BE, 30 min)

```
Read CLAUDE.md. Prepare Vercel deployment:
- List every environment variable Vercel needs. TREASURY_SECRET_KEY replaces the keypair path.
- Print the command to get the treasury secret as a JSON array from ~/gt-keys/treasury.json
  so I paste it into Vercel myself. Do not print the secret.
- Confirm lib/solana/payout.ts loads from TREASURY_SECRET_KEY on Vercel.
- Remove the mock submit flag. Run npm run build.
```

Accept (PHASE 2 PASS):
- [ ] One phone photo on the Vercel URL pays a wallet on devnet

---

## Phase 3. Checks (next 4 hours)

### T8. Anti-spoof checks (ML + BE, 2 to 3 hours) BIG

```
Read CLAUDE.md and BUILD_PLAN.md T8. Implement lib/checks with one file per check and unit tests:

1. hash.ts: dHash. sharp -> grayscale -> resize 9x8 -> compare adjacent pixels -> 64-bit hex.
   hamming(a, b). Duplicate if distance <= 6 against any observation hash from the last 7 days.
   Reason: "This photo was already submitted".
2. geofence.ts: haversine distance. Find the nearest market. Reject if outside radius_m
   or if GPS accuracy is worse than 100 m.
   Reasons: "Not inside a known market", "GPS signal too weak, step outside and retry".
3. rateLimit.ts: max 20 submissions per wallet per hour and 1 per 10 seconds.
   Reason: "Too many photos, wait a moment".
4. outlier.ts: for each extracted item, median of non-outlier prices for the same item,
   currency, and unit in the same market over 24 hours. Needs 5 or more samples.
   Flag as outlier when abs(price - median) / median > 0.6.
   Outlier prices get outlier=true and stay out of the index.
   If every item on the photo is an outlier: reject "Prices do not match this market".
5. Screen detection already comes from extractPrices (is_direct_photo).

Order in /api/submit: rate limit, geofence, duplicate hash, then vision, then outlier.
Cheap checks run before the paid vision call.
Vitest: hamming of identical images is 0, a resized copy is <= 6, a different photo is > 6,
haversine against a known distance, outlier math with fixed arrays.
Run npm test and show me the results.
```

Accept (PHASE 3 PASS):
- [ ] npm test passes
- [ ] A photo of a laptop screen gets rejected on the live site with a reason
- [ ] Submitting the same shot twice gets rejected

### T9. Contributor history (FE, 45 min)

```
Read CLAUDE.md. Add /me: the wallet's submissions with thumbnail, status, reason,
items, payout link, and total USDC earned. Add GET /api/me?wallet=... on the server.
```

### T10. Review queue (BE, 45 min)

```
Read CLAUDE.md. Add /admin, protected by ?key= matching ADMIN_KEY (compare server side).
List observations with status review or payout_failed: photo, extracted items, confidence.
Buttons: Approve (sets verified, runs payContributor) and Reject (asks for a reason).
```

---

## Phase 4. Map and data (next 4 hours)

### T11. Map and index (FE, 2 hours) BIG

```
Read CLAUDE.md. Build /map:
- react-leaflet loaded with next/dynamic and ssr false. Import the Leaflet CSS.
  Fix the default marker icon paths.
- GET /api/index?item=tomato returns, per market: median, count, currency, unit,
  last updated, and the 5 latest verified prices with photo URL and payout link.
- Item dropdown from distinct items in the last 7 days. Default: the most common item.
- Marker per market labeled with the median. Popup: the 5 latest prices with thumbnails
  and explorer links.
- Refresh every 10 seconds, so a new verified photo appears live during the demo.
- Stats bar from GET /api/stats: photos verified, USDC paid, spoof attempts blocked
  (rejections with a spoof, duplicate, or outlier reason).
```

Accept (PHASE 4 PASS part 1):
- [ ] A new verified photo shows on the map within 10 seconds

### T12. Paid query API (BE, 90 min) BIG

```
Read CLAUDE.md and BUILD_PLAN.md T12. Build GET /api/price?item=...&market=...
- Without an X-Payment-Tx header: respond 402 with JSON
  { amount: "0.01", amountBase: 10000, mint: USDC_MINT, recipient: <treasury address>,
    reference: <random id>, memo: "gtq:<reference>", expiresInSeconds: 300 }
  and store the reference.
- With X-Payment-Tx and X-Payment-Reference: fetch the transaction at confirmed commitment.
  Verify: succeeded, the treasury token account received at least 10000 base units of
  USDC_MINT (use pre and post token balances), a memo equals gtq:<reference>,
  the reference exists, is unexpired, and was never used. Insert into query_payments.
- On success return { item, market, median, currency, unit, count, latest: [ { price,
  unit, captured_at, photo_url, payout_tx } ] }.
- Reasons for 402 on a failed check: "Payment not found", "Wrong amount", "Reference already used".
Write lib/solana/payQuery.ts: given a 402 body and a payer keypair, send the transfer with the
memo and return the signature. Write scripts/query-test.ts that runs the full flow with the
agent wallet and prints the answer.
```

Accept (PHASE 4 PASS part 2):
- [ ] query-test returns a price tied to a source photo
- [ ] Replaying the same signature fails

### T13. AI agent demo (ML, 60 min) STRETCH

```
Read CLAUDE.md. Write scripts/agent-demo.ts:
- An Anthropic SDK tool-use loop with one tool: get_market_price(item, market).
- The tool calls /api/price on the Vercel URL. On 402 it pays with lib/solana/payQuery.ts
  from the agent wallet, retries with the headers, and returns the JSON.
- The user question comes from the command line, for example:
  "What does a kilo of tomatoes cost at <market> today, and how fresh is the data?"
- Print each step for the audience: question, 402 received, paid 0.01 USDC (explorer link),
  data received, final answer citing the photo timestamp.
Keep the console output large and readable for a projector.
```

If time allows after T13, ask Claude Code to wrap /api/price with the official x402 tooling for Solana (solana.com/x402) while keeping the current flow as fallback.

---

## Phase 5. Ship (Saturday night to Sunday morning)

### T14. Seed data (LEAD, during phases 2 and 3)

- Visit 3 to 5 stores or markets in scripts/markets.json while open.
- Take 50 or more real photos through the live app with 3 or more wallets.
- Try 10 spoof attempts on purpose (screens, printouts, repeats) so the stats bar shows real blocks.

### T15. Demo hardening (all, 60 min)

```
Read CLAUDE.md. Audit the app for the live demo:
- Every error path shows a human reason, never a stack trace.
- Add loading states for the camera, GPS, and the submit call (vision takes a few seconds).
- Add a /demo page: big stats, the map, and a QR code to the capture page.
- Check mobile Safari and Chrome on Android.
- List anything that would break with devnet congestion and how the UI handles it.
```

### T16. README and submission (LEAD, 60 min)

```
Read CLAUDE.md and BUILD_PLAN.md. Write README.md: problem, how it works (6 steps),
architecture, the six checks, devnet addresses (mint, treasury), explorer links to three
real payouts and one query payment, how to run locally, team, and what we would build next
(Solana Attestation Service records, reputation, x402, more markets).
```

Freeze features at 1:00 AM ET Sunday. Video by 8:00 AM. Initial submission before 10:00 AM. Final by 11:45 AM.

---

## Parallel schedule

| Slot | ML | BE | FE | LEAD |
| --- | --- | --- | --- | --- |
| Gate | T3 | T0, T1, T2 | T6 starts | Part 0, Copilot check, markets.json |
| Core | T3 tuning | T4, T5 | T6 | T7, T14 |
| Checks | T8 (hash, outlier) | T8 (geofence, rate), T10 | T9 | T14 |
| Map | T13 | T12 | T11 | T14, video script |
| Ship | T15 | T15 | T15 | T16 |

## Rules for every session

- Devnet only. Keys stay in ~/gt-keys and environment variables.
- One task per session. Merge to main only after the acceptance list passes.
- When an API detail is uncertain, check the installed package types or official docs first.
- Cut order if behind: T13, T10, outlier check, map polish. Never cut T2, T3, T5, T6, T8 hash and screen checks, T11 basic map.
