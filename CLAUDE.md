# Ground Truth

Project for the MLH Solana Hackathon. Final submission: Sunday Nov 8, 11:45 AM ET. Initial submission: 10:00 AM ET.
Full plan: https://claude.ai/artifact/1JALqfJde1S6upiJRZEdpm
Build tasks and acceptance checks: BUILD_PLAN.md. Work one task at a time.

## What we build
Contributors photograph price boards in markets. A vision model extracts item, price, currency, and unit. Checks reject spoofed photos. Each verified photo pays 0.05 USDC on Solana devnet, and the treasury pays every fee. Verified prices feed a map and a paid query API at 0.01 USDC per query.

## Stack
- Next.js with TypeScript, deployed to Vercel (phone cameras need HTTPS)
- Supabase Postgres, SQLite while building locally
- Claude API for extraction and screen detection, strict JSON output
- Perceptual image hashing in Node
- Solana devnet: SPL token transfers and the Memo program, using @solana/web3.js v1 and @solana/spl-token
- Mock USDC: an SPL token minted on devnet by a script
- Leaflet with OpenStreetMap tiles
- Paid queries: x402 as a stretch goal. Fallback: the server verifies a 0.01 USDC transfer before answering

## Folders
- app/            pages and API routes
- lib/vision/     extraction and screen detection prompts and schema
- lib/checks/     one file per check
- lib/solana/     payout, memo, query payment verification
- lib/db/         observation queries
- scripts/        mint mock USDC, fund treasury, seed data
- eval/           20 test photos and expected.json

## Observation record
id, contributor (wallet), item, price, currency, unit, market, lat, lon, captured_at, nonce, image_hash, confidence, status (verified, rejected, review), reason, payout_tx

## Checks (lib/checks)
1. Live capture: in-app camera only, server nonce expires after 120 seconds
2. Geofence: GPS inside the market radius
3. Duplicate: perceptual hash against past submissions
4. Screen and print detection: vision model check
5. Price outlier: compare with the area median for the same item over 24 hours
6. Rate limit: maximum submissions per wallet per hour

## Rules
1. Devnet only. Never send a mainnet transaction.
2. The treasury key lives only in .env as TREASURY_SECRET_KEY. Never commit keys. Keep .env in .gitignore.
3. Every rejection returns a plain reason string to the user.
4. Payout transaction: the treasury is the fee payer, creates the recipient token account if missing, and adds the memo gt:<observation_id>:<image_hash>.
5. Vision output must validate against the schema. Confidence below 0.7 sets status to review with no payout.
6. Run npm run eval after every prompt change. Target: 16 of 20 correct on item and price.
7. Check installed package types and docs before calling a Solana API. Do not guess function names.
8. One feature per branch. Respect folder owners from the plan.
9. Keep commits small and frequent.

## Phase pass checks
1. Gate: Copilot check clear, 16 of 20 eval photos correct, one devnet payout with app-paid fees lands
2. Core loop: one phone photo on the Vercel deployment pays a wallet
3. Checks: a photo of a screen gets rejected with a reason
4. Map and data: a query returns a price tied to a source photo
5. Feature freeze at 1:00 AM ET Sunday. Bugs only after that

## Cut order if behind
x402 agent, then reputation, then outlier check, then map polish.
Always keep: capture, extraction, two checks, payout, simple map.
Never open or print .env.local or any file in the gt-keys folder.
