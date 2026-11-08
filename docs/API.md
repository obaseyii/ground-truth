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

Defined in BUILD_PLAN.md T5. Not built yet.

**Body (JSON):** `{ "wallet": "<base58 address>" }`

```json
{ "nonce": "9f1c2e...16 bytes hex", "expiresInSeconds": 120 }
```

## POST /api/submit

Defined in BUILD_PLAN.md T5. Not built yet.

**Body (multipart/form-data):** `image` (JPEG), `nonce`, `wallet`, `lat`, `lon`, `accuracy`.

`reason` is present when the status is `rejected` or `review`. `payoutTx` and `explorerUrl` are present only when the status is `verified`.

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
{ "status": "rejected", "reason": "This looks like a photo of a screen, not a price board", "observationId": "obs_k4v9b6tu", "items": [] }
```
