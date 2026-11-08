import { z } from "zod";

/**
 * API contract shared by the frontend and the route handlers.
 * Amounts in USDC are decimal numbers (0.05 = 5 cents), not base units.
 * Timestamps are ISO 8601 strings in UTC.
 */

export const ObservationStatus = z.enum(["verified", "rejected", "review", "payout_failed"]);
export type ObservationStatus = z.infer<typeof ObservationStatus>;

/** One price read from a photo. */
export const PriceItem = z.object({
  item: z.string(),
  price: z.number(),
  currency: z.string(),
  unit: z.string(),
});
export type PriceItem = z.infer<typeof PriceItem>;

/** Error body for every non-2xx response. */
export const ApiError = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiError>;

// GET /api/markets
export const Market = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  radius_m: z.number(),
});
export type Market = z.infer<typeof Market>;
export const MarketsResponse = z.array(Market);
export type MarketsResponse = z.infer<typeof MarketsResponse>;

// GET /api/items
export const ItemCount = z.object({ item: z.string(), count: z.number().int() });
export type ItemCount = z.infer<typeof ItemCount>;
export const ItemsResponse = z.array(ItemCount);
export type ItemsResponse = z.infer<typeof ItemsResponse>;

// GET /api/index?item=
export const LatestPrice = z.object({
  price: z.number(),
  unit: z.string(),
  capturedAt: z.string(),
  photoUrl: z.string(),
  payoutTx: z.string().nullable(),
  explorerUrl: z.string().nullable(),
});
export type LatestPrice = z.infer<typeof LatestPrice>;

export const MarketIndex = z.object({
  marketId: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  median: z.number(),
  count: z.number().int(),
  currency: z.string(),
  unit: z.string(),
  updatedAt: z.string(),
  latest: z.array(LatestPrice),
});
export type MarketIndex = z.infer<typeof MarketIndex>;

export const IndexResponse = z.object({
  item: z.string(),
  markets: z.array(MarketIndex),
});
export type IndexResponse = z.infer<typeof IndexResponse>;

// GET /api/stats
export const StatsResponse = z.object({
  verified: z.number().int(),
  usdcPaid: z.number(),
  blocked: z.number().int(),
});
export type StatsResponse = z.infer<typeof StatsResponse>;

// GET /api/activity
export const ActivityEntry = z.object({
  observationId: z.string(),
  status: ObservationStatus,
  reason: z.string().nullable(),
  items: z.array(PriceItem),
  contributor: z.string(),
  payoutTx: z.string().nullable(),
  explorerUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;
export const ActivityResponse = z.array(ActivityEntry).max(20);
export type ActivityResponse = z.infer<typeof ActivityResponse>;

// GET /api/me?wallet=
export const Submission = z.object({
  observationId: z.string(),
  status: ObservationStatus,
  reason: z.string().nullable(),
  items: z.array(PriceItem),
  payoutTx: z.string().nullable(),
  explorerUrl: z.string().nullable(),
  photoUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type Submission = z.infer<typeof Submission>;

export const MeResponse = z.object({
  wallet: z.string(),
  totalUsdc: z.number(),
  submissions: z.array(Submission),
});
export type MeResponse = z.infer<typeof MeResponse>;

// POST /api/nonce (BUILD_PLAN.md T5)
export const NonceRequest = z.object({ wallet: z.string() });
export type NonceRequest = z.infer<typeof NonceRequest>;
export const NonceResponse = z.object({
  nonce: z.string(),
  expiresInSeconds: z.literal(120),
});
export type NonceResponse = z.infer<typeof NonceResponse>;

// POST /api/submit (BUILD_PLAN.md T5)
// Request is multipart/form-data. Required: image (JPEG, PNG, WebP, HEIF, under 3 MB), nonce,
// wallet, marketId. Optional: lat, lon, accuracy (numbers; stored, not checked yet).
export const SubmitFields = z.object({
  nonce: z.string(),
  wallet: z.string(),
  marketId: z.string(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  accuracy: z.number().optional(),
});
export type SubmitFields = z.infer<typeof SubmitFields>;

export const SubmitItem = PriceItem.extend({ raw_label: z.string() });
export type SubmitItem = z.infer<typeof SubmitItem>;

/**
 * verified: prices saved and 0.05 USDC paid (payoutTx and explorerUrl set).
 * review: confidence under 0.7, prices saved, no payout. reason set.
 * rejected: a check failed. reason set, items empty.
 * payout_failed: prices saved but the payout transaction failed. reason set.
 */
export const SubmitResponse = z.object({
  status: ObservationStatus,
  reason: z.string().optional(),
  observationId: z.string(),
  items: z.array(SubmitItem),
  payoutTx: z.string().optional(),
  explorerUrl: z.string().optional(),
});
export type SubmitResponse = z.infer<typeof SubmitResponse>;

// GET /api/balance?wallet= (mock USDC on devnet)
export const BalanceResponse = z.object({
  wallet: z.string(),
  usdc: z.number(),
  baseUnits: z.string(),
});
export type BalanceResponse = z.infer<typeof BalanceResponse>;
