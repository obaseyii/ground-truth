# Ground Truth

Verified market prices from photos, paid in USDC on Solana devnet.

## The problem

Price data from informal markets is scarce. Open-air markets, street stalls, and small shops set prices on boards and in conversation. Few of those prices are ever recorded. Researchers, aid groups, and traders work from old or missing numbers. The people who see these prices every day earn nothing for sharing them.

## The solution

Ground Truth pays people to photograph price boards. A contributor opens the app, picks a market, and takes a photo with the in-app camera. A vision model reads each item, price, currency, and unit. Checks reject reused photos and photos of screens or prints. Each verified photo pays the contributor 0.05 mock USDC on Solana devnet, and the treasury pays every network fee. The contributor needs no SOL. Verified prices go into a public data feed, and each price links to the payout that paid for it.

## How it works

1. **Capture with a nonce.** The app opens the live camera and asks the server for a nonce. The nonce belongs to one wallet, works once, and expires after 120 seconds. There is no file upload.
2. **Vision extraction.** Claude reads the photo and returns strict JSON: item, price, currency, unit, and a confidence score. The output must validate against a schema.
3. **Checks.** The server runs the checks in the table below. Every rejection returns a plain reason to the contributor.
4. **Payout.** A verified photo pays 0.05 mock USDC from the treasury. The treasury is the fee payer. It creates the contributor's token account if it is missing. Each transfer carries the memo `gt:<observation_id>:<image_hash>`. Each observation is paid at most once.
5. **Publish to the feed.** Verified prices appear in `GET /api/observations` and in static files under `public/data`. Each record has the source photo's hash and an explorer link to its payout.
6. **Paid access (planned).** Buyers will pay 0.01 USDC per price query. This step is not built yet.

## Checks

| Live today | Planned |
| --- | --- |
| Live capture: in-app camera only, with a single-use nonce that expires after 120 seconds | Geofence: the GPS position must be inside the market radius |
| Duplicate detection: a perceptual hash (dHash) is compared against recent submissions | Price outlier: compare each price with the area median for the same item over 24 hours |
| Screen and print detection: the vision model flags photos of screens or printed photos | Rate limit: a maximum number of submissions per wallet per hour |
| Confidence review: below 0.7, the photo goes to review with no payout | Paid query: 0.01 USDC per query |

The app stores GPS position when the phone shares it, but nothing checks it yet.

## Architecture

- **App:** Next.js with TypeScript. Pages and API routes live in `app/`.
- **Database:** SQLite, through Node's built-in `node:sqlite`. The file is `data/gt.db`.
- **Vision:** Claude, with a strict JSON schema. Prompts and schema live in `lib/vision/`.
- **Checks:** one file per check in `lib/checks/`.
- **Payments:** Solana devnet, with `@solana/web3.js` v1, `@solana/spl-token`, and the Memo program. Code lives in `lib/solana/`.
- **Website:** https://ground-truth-website.vercel.app presents the project.
- **Public data feed:** `npm run export-observations` writes `public/data/observations.json` and `public/data/stats.json`. The same records are served live at `GET /api/observations`, with CORS open. See `docs/API.md`.

## Devnet addresses

| Account | Address |
| --- | --- |
| Mock USDC mint | [`HJKAYGpQQGnfCVfhRdRgKUTivKukTyYMi9wWE3rHRxZ8`](https://explorer.solana.com/address/HJKAYGpQQGnfCVfhRdRgKUTivKukTyYMi9wWE3rHRxZ8?cluster=devnet) |
| Treasury | [`EuTPApHbWYNZtLxBRgy8zTG5jLnmHwXiNMLE2ZyXEsqZ`](https://explorer.solana.com/address/EuTPApHbWYNZtLxBRgy8zTG5jLnmHwXiNMLE2ZyXEsqZ?cluster=devnet) |

## Real payouts

Three payouts from `public/data/observations.json`. Each one sends 0.05 mock USDC, has the treasury as fee payer, and carries a `gt:` memo.

| Observation | Price | Market | Payout |
| --- | --- | --- | --- |
| `obs_rzevohsm` | plate, 10.70 USD | Newark Demo Stores | [325xkAYt...hdRkB](https://explorer.solana.com/tx/325xkAYtFooAhCTdbHw9DQEiKtLgEbbzfgWFuYVdXqnyv3QFBxWmtkjrue8NGBpo4oU7y5rpgpjD1C7Qjt1hdRkB?cluster=devnet) |
| `obs_v2iuo2hd` | plate, 10.70 USD | Newark Demo Stores | [8vgCMVDi...aQhyp](https://explorer.solana.com/tx/8vgCMVDihjaVAXmBafh8oyNS411Jqy5Da3ZY8Q4Vk2x3GKsf48hHG3GZiDPypkPHh2bEhEMaTy8mJQJiKcaQhyp?cluster=devnet) |
| `obs_1zakuo0z` | 2-entree plate, 10.70 USD | Balogun Market, Lagos | [5uk1RyW3...d1N](https://explorer.solana.com/tx/5uk1RyW3GTncmE4tyw8t7r9S88vv8HmD3VDHnYJXUJXGtSprHGYqML823cmtHQY6ThGFL1SoofFoCA2DVk8yvd1N?cluster=devnet) |

## Eval results

`npm run eval` runs the vision model on the photos in `eval/photos` and compares the output with `eval/expected.json`.

- 6 of 6 photos pass.
- Both screen photos are flagged. One shows a laptop screen and one shows a phone screen.

## Known limits

- The app runs on a laptop with a local SQLite database. It is not deployed as a hosted service.
- The USDC is a mock token minted on devnet. It has no value.
- Receipts and price boards of any date are accepted. Nothing checks how old the prices are.
- Geofence, price outlier, rate limit, and paid queries are planned, not built.

## Run locally

You need Node 22.13 or later, a Claude API key, and two devnet keypair files: one for the treasury and one for a test agent.

1. Install packages.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values. Never commit `.env.local` or keypair files.

   ```bash
   cp .env.example .env.local
   ```

3. Fund the treasury with devnet SOL at https://faucet.solana.com.

4. Create the mock USDC mint and fund the wallets. Copy the printed mint address into `USDC_MINT`.

   ```bash
   npm run mint
   ```

5. Check the environment and seed the markets.

   ```bash
   npm run check-env
   npm run seed-markets
   ```

6. Start the app and open http://localhost:3000. Phone cameras need HTTPS, so use a laptop browser or an HTTPS tunnel.

   ```bash
   npm run dev
   ```

Other scripts:

- `npm run eval` runs the vision eval.
- `npm run export-observations` writes the public data feed to `public/data`.
- `npm run payout-test` sends one 0.05 mock USDC payout to a new wallet.
- `npm run build && npm run submit-test` runs the submit pipeline end to end on a throwaway database.

## Team

- **Emmanuel Kogbe:** backend, vision extraction, Solana payouts, and the capture app.
- **Mohamed Ben Abdellah:** the project website, with the map, price explorer, rewards, and data pages.

Made for the MLH Solana Hackathon.
