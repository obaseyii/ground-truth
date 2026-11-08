# Ground Truth API

Schemas and TypeScript types for every response live in `lib/types.ts`. Import types from there; don't copy shapes by hand.

## Conventions

- All responses are JSON.
- Timestamps are ISO 8601 strings in UTC.
- USDC amounts are decimal numbers (`0.05`), not base units.
- `explorerUrl` links to Solana Explorer on devnet.
- Status values: `verified`, `rejected`, `review`, `payout_failed`.

### Errors

Every non-2xx response has this body:

```json
{ "error": "Missing item parameter, for example ?item=tomato" }
```

| Status | When |
| --- | --- |
| 400 | A required parameter is missing or invalid |
| 501 | `USE_FIXTURES=false` and the live query isn't built yet |
| 500 | Unexpected server error |

## Fixtures

`USE_FIXTURES` in `lib/config.ts` defaults to `true`. While it is on, the six GET routes return data from `fixtures/`. Set the environment variable `USE_FIXTURES=false` to switch to live data.

The fixtures contain 4 markets, 3 items (tomato, rice, palm oil) and 12 observations: 10 verified, 1 rejected and 1 in review. They are internally consistent, so `/api/stats` and `/api/items` match `/api/activity`.

- The transaction signatures and wallets are made up. Explorer links open, but the transactions don't exist.
- Photos point to `/fixtures/photo.svg`, a placeholder image.
- `fixtures/nonce.json` and `fixtures/submit.json` (with `verified`, `review` and `rejected` variants) are there for frontend mocks. The POST routes don't read them.

---

## GET /api/markets

All markets.

**Parameters:** none.

```json
[
  { "id": "mkt_mile12", "name": "Mile 12 Market, Lagos", "lat": 6.6089, "lon": 3.3953, "radius_m": 200 },
  { "id": "mkt_gikomba", "name": "Gikomba Market, Nairobi", "lat": -1.2846, "lon": 36.8361, "radius_m": 300 }
]
```

## GET /api/items

Items with verified prices and how many prices each has, most common first.

**Parameters:** none.

```json
[
  { "item": "tomato", "count": 6 },
  { "item": "rice", "count": 5 },
  { "item": "palm oil", "count": 4 }
]
```

## GET /api/index?item=

Price index for one item. Returns one entry per market that has verified prices for that item. `latest` holds up to 3 recent prices, newest first.

**Parameters**

| Name | In | Required | Notes |
| --- | --- | --- | --- |
| `item` | query | yes | Canonical item name, for example `tomato` or `palm oil` (URL encoded as `palm%20oil`). Case-insensitive. |

An unknown item returns `{ "item": "...", "markets": [] }` with status 200. A missing `item` returns 400.

```json
{
  "item": "tomato",
  "markets": [
    {
      "marketId": "mkt_mile12",
      "name": "Mile 12 Market, Lagos",
      "lat": 6.6089,
      "lon": 3.3953,
      "median": 1150,
      "count": 2,
      "currency": "NGN",
      "unit": "kg",
      "updatedAt": "2026-11-07T14:35:00.000Z",
      "latest": [
        {
          "price": 1100,
          "unit": "kg",
          "capturedAt": "2026-11-07T14:35:00.000Z",
          "photoUrl": "/fixtures/photo.svg",
          "payoutTx": "23sXMBde...pUhgUjZ",
          "explorerUrl": "https://explorer.solana.com/tx/23sXMBde...pUhgUjZ?cluster=devnet"
        }
      ]
    }
  ]
}
```

## GET /api/stats

Totals for the dashboard header. `blocked` counts rejected submissions.

**Parameters:** none.

```json
{ "verified": 10, "usdcPaid": 0.5, "blocked": 1 }
```

## GET /api/observations

Public data feed for the website. One record per extracted price from **verified** observations, newest first, at most 500. Always reads the database (ignores `USE_FIXTURES`). CORS is open (see below).

**Parameters**

| Name | In | Required | Notes |
| --- | --- | --- | --- |
| `item` | query | no | Canonical item name, case-insensitive, for example `tomato` |
| `market` | query | no | Market id or market name, case-insensitive, for example `mkt_mile12` |

**Record fields**

| Field | Notes |
| --- | --- |
| `id` | Observation id, a dash, and the 0-based item index within the photo, for example `obs_a1k9x2pq-0` |
| `observation_id` | The photo's observation id |
| `contributor` | Contributor wallet (base58) |
| `item`, `price`, `currency`, `unit` | The extracted price |
| `market` | Market name, `null` if none |
| `lat`, `lon` | Stored capture position, otherwise the market position |
| `captured_at` | ISO 8601 UTC |
| `nonce` | Always `null` (not published) |
| `image_hash` | Perceptual hash (dHash hex) |
| `confidence` | Vision model confidence, 0 to 1 |
| `status` | Always `verified` |
| `reason` | Always `null` |
| `payout_tx` | Devnet payout signature, or `null` |
| `explorer_url` | Solana Explorer devnet link, or `null` |

```json
[
  {
    "id": "obs_a1k9x2pq-0",
    "observation_id": "obs_a1k9x2pq",
    "contributor": "FbmQiaqB2cFx91eY7aeHSgv3HJWqGZ5xGY4pJR4LNZXb",
    "item": "tomato",
    "price": 1200,
    "currency": "NGN",
    "unit": "kg",
    "market": "Mile 12 Market, Lagos",
    "lat": 6.6089,
    "lon": 3.3953,
    "captured_at": "2026-11-08T09:12:00.000Z",
    "nonce": null,
    "image_hash": "f0e1d2c3b4a59687",
    "confidence": 0.92,
    "status": "verified",
    "reason": null,
    "payout_tx": "3vQ...",
    "explorer_url": "https://explorer.solana.com/tx/3vQ...?cluster=devnet"
  }
]
```

### Static export

`npm run export-observations` reads the database and writes:

- `public/data/observations.json`: the same array as `GET /api/observations` with no filters
- `public/data/stats.json`: `{ "verified", "usdcPaid", "blocked", "updatedAt" }`. `verified` counts verified photos, `usdcPaid` is 0.05 per landed payout, `blocked` counts rejected photos, `updatedAt` is the export time (ISO UTC)

The site can load these from `/data/observations.json` and `/data/stats.json` without hitting the database. Rerun the script and commit to refresh them.

### CORS

`GET /api/observations`, `GET /api/markets` and `GET /api/stats` send `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: GET, OPTIONS`, and answer `OPTIONS` preflight with 204. `nonce`, `submit` and `balance` have no CORS headers.

## GET /api/activity

The 20 most recent submissions or fewer, newest first. `reason` is `null` for verified entries. `items` is empty for rejected entries.

**Parameters:** none.

```json
[
  {
    "observationId": "obs_k4v9b6tu",
    "status": "rejected",
    "reason": "This looks like a photo of a screen, not a price board",
    "items": [],
    "contributor": "BRr78J8CGwMGsFRjoEMAvgTPjsWnnxJRU6J79SoWXXsw",
    "payoutTx": null,
    "explorerUrl": null,
    "createdAt": "2026-11-07T21:00:00.000Z"
  },
  {
    "observationId": "obs_j1d3s8xo",
    "status": "verified",
    "reason": null,
    "items": [{ "item": "tomato", "price": 130, "currency": "KES", "unit": "kg" }],
    "contributor": "Hq3...",
    "payoutTx": "4xYh...",
    "explorerUrl": "https://explorer.solana.com/tx/4xYh...?cluster=devnet",
    "createdAt": "2026-11-07T20:30:00.000Z"
  }
]
```

## GET /api/me?wallet=

One contributor's submissions and total earnings, newest first.

**Parameters**

| Name | In | Required | Notes |
| --- | --- | --- | --- |
| `wallet` | query | yes | Base58 Solana address |

A missing or invalid wallet returns 400. In fixture mode, any valid wallet gets the same sample history, with `wallet` set to the address you passed.

```json
{
  "wallet": "FbmQiaqB2cFx91eY7aeHSgv3HJWqGZ5xGY4pJR4LNZXb",
  "totalUsdc": 0.2,
  "submissions": [
    {
      "observationId": "obs_l7c2f5qi",
      "status": "review",
      "reason": "Hard to read, waiting for review. No payout yet",
      "items": [{ "item": "tomato", "price": 18, "currency": "GHS", "unit": "kg" }],
      "payoutTx": null,
      "explorerUrl": null,
      "photoUrl": "/fixtures/photo.svg",
      "createdAt": "2026-11-07T21:35:00.000Z"
    }
  ]
}
```

---

## POST /api/nonce

Starts a capture session. Request a new nonce when the camera opens and after every submit.

**Body (JSON):** `{ "wallet": "<base58 address>" }`

Returns a random 16-byte hex nonce tied to that wallet. It works once, within 120 seconds. An invalid wallet returns 400.

```json
{ "nonce": "9f1c2e7a0b4d4e1f8c3a5b6d7e8f9012", "expiresInSeconds": 120 }
```

## POST /api/submit

Submits one photo. Slow: the vision call plus a devnet payout can take 10 to 30 seconds.

**Body (multipart/form-data)**

| Field | Required | Notes |
| --- | --- | --- |
| `image` | yes | File. JPEG preferred (PNG, WebP, HEIF also decode). Under 3 MB. |
| `nonce` | yes | From `POST /api/nonce` for the same wallet |
| `wallet` | yes | Base58 Solana address that receives the payout |
| `marketId` | yes | An `id` from `GET /api/markets` |
| `lat`, `lon`, `accuracy` | no | Numbers. Stored, not checked yet (geofence comes in T8) |

A missing or malformed field, or an unknown `marketId`, returns 400 with `{ "error": "..." }`. Every check failure returns 200 with `status: "rejected"` and a plain `reason`.

**Pipeline, in order**

1. Nonce exists, belongs to the wallet, is unused and under 120 seconds old. It is marked used in the same step, so a nonce works once even if a later step fails.
2. Image is under 3 MB and decodes.
3. Duplicate check: dHash with Hamming distance 6 or less against any submission in the last 7 days.
4. Vision extraction. A photo of a screen or print is rejected with the model's reason before any items are used. No items: rejected with "No readable prices found". Confidence under 0.7: `review`, no payout.
5. The observation and its prices are saved. Rejections are saved too (for stats), without prices.
6. Verified photos are paid 0.05 USDC on devnet. Each observation is paid at most once. If the payment fails, the status is `payout_failed` and the record is kept.

**Response**

| Status | `reason` | `items` | `payoutTx`, `explorerUrl` |
| --- | --- | --- | --- |
| `verified` | absent | extracted prices | present |
| `review` | present | extracted prices | absent |
| `payout_failed` | present | extracted prices | absent |
| `rejected` | present | `[]` | absent |

```json
{
  "status": "verified",
  "observationId": "obs_a1k9x2pq",
  "items": [
    { "item": "tomato", "raw_label": "TOMATOES (1kg)", "price": 1200, "currency": "NGN", "unit": "kg" }
  ],
  "payoutTx": "3vQ...",
  "explorerUrl": "https://explorer.solana.com/tx/3vQ...?cluster=devnet"
}
```

```json
{ "status": "rejected", "reason": "This photo was already submitted", "observationId": "obs_k4v9b6tu", "items": [] }
```

Rejection reasons the app may show:

- This capture session is not valid. Reopen the camera and try again
- This capture session belongs to a different wallet
- This capture session was already used. Take a new photo
- This capture session expired. Take the photo again
- Photo is larger than 3 MB
- Could not open the photo. Take it again
- This photo was already submitted
- Could not read the photo right now. Please try again
- No readable prices found
- The vision model's spoof reason, for example "This looks like a photo of a screen"
