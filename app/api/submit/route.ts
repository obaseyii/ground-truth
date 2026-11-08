// POST /api/submit  multipart: image, nonce, wallet, marketId, optional lat, lon, accuracy.
// Pipeline (BUILD_PLAN.md T5): nonce -> image -> duplicate hash -> vision -> save -> payout.
// Every failed step returns { status: "rejected", reason } with HTTP 200.
// GPS and geofence checks are skipped for now (T8).
import { randomInt } from "node:crypto";
import sharp from "sharp";
import { isWallet, jsonError } from "@/lib/api";
import {
  DUPLICATE_REASON,
  DUPLICATE_WINDOW_MS,
  dHash,
  findNearDuplicate,
} from "@/lib/checks";
import {
  claimPayout,
  consumeNonce,
  getMarket,
  insertObservation,
  markPayoutFailed,
  recentImageHashes,
  recordPayout,
  type ConsumeNonceResult,
  type NewObservation,
  type NewPrice,
} from "@/lib/db";
import { txUrl } from "@/lib/solana/explorer";
import { payContributor } from "@/lib/solana/payout";
import { extractPrices, type ExtractResult } from "@/lib/vision/extract";
import { SubmitResponse, type SubmitItem } from "@/lib/types";

// The vision call can take 10 to 30 seconds, plus a devnet confirmation.
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MIN_CONFIDENCE = 0.7;
const PAYOUT_BASE_UNITS = BigInt(50_000); // 0.05 USDC

const REASONS = {
  nonce: {
    unknown: "This capture session is not valid. Reopen the camera and try again",
    wrong_wallet: "This capture session belongs to a different wallet",
    used: "This capture session was already used. Take a new photo",
    expired: "This capture session expired. Take the photo again",
  } satisfies Record<Exclude<ConsumeNonceResult, { ok: true }>["problem"], string>,
  tooLarge: "Photo is larger than 3 MB",
  undecodable: "Could not open the photo. Take it again",
  visionFailed: "Could not read the photo right now. Please try again",
  spoofDefault: "This does not look like a direct photo of a price board",
  noPrices: "No readable prices found",
  review: "Hard to read, waiting for review. No payout yet",
  payoutFailed: "Prices saved, but the payout failed. It will be retried",
};

const SHARP_FORMAT_TO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heif: "image/heif",
  gif: "image/gif",
};

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function newObservationId(): string {
  let id = "obs_";
  for (let i = 0; i < 8; i++) id += ID_CHARS[randomInt(ID_CHARS.length)];
  return id;
}

function optionalNumber(value: FormDataEntryValue | null): number | null | "invalid" {
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string") return "invalid";
  const n = Number(value);
  return Number.isFinite(n) ? n : "invalid";
}

function respond(body: SubmitResponse): Response {
  return Response.json(SubmitResponse.parse(body));
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Body must be multipart/form-data", 400);

  const image = form.get("image");
  const nonce = form.get("nonce");
  const wallet = form.get("wallet");
  const marketId = form.get("marketId");
  if (!(image instanceof File)) return jsonError("Missing field: image (a file)", 400);
  if (typeof nonce !== "string" || !nonce.trim()) return jsonError("Missing field: nonce", 400);
  if (typeof wallet !== "string" || !isWallet(wallet.trim())) {
    return jsonError("Missing or invalid field: wallet (a Solana address)", 400);
  }
  if (typeof marketId !== "string" || !marketId.trim()) return jsonError("Missing field: marketId", 400);
  const lat = optionalNumber(form.get("lat"));
  const lon = optionalNumber(form.get("lon"));
  const accuracy = optionalNumber(form.get("accuracy"));
  if (lat === "invalid" || lon === "invalid" || accuracy === "invalid") {
    return jsonError("lat, lon, and accuracy must be numbers when present", 400);
  }
  if (!getMarket(marketId.trim())) return jsonError(`Unknown marketId: ${marketId}`, 400);

  const observationId = newObservationId();
  const capturedAt = Date.now();
  const base: NewObservation = {
    id: observationId,
    contributor: wallet.trim(),
    market_id: marketId.trim(),
    lat,
    lon,
    accuracy,
    captured_at: capturedAt,
    nonce: nonce.trim(),
    image_hash: null,
    confidence: null,
    status: "rejected",
    reason: null,
  };

  // Saves a rejected observation (counted by /api/stats) and returns the rejection.
  const reject = (reason: string, extra: Partial<NewObservation> = {}): Response => {
    try {
      insertObservation({ ...base, ...extra, status: "rejected", reason });
    } catch (err) {
      console.error(`submit ${observationId}: could not save rejection`, err);
    }
    return respond({ status: "rejected", reason, observationId, items: [] });
  };

  // Step 1: nonce exists, belongs to this wallet, is unused and fresh. Marked used here.
  const nonceResult = consumeNonce(base.nonce!, base.contributor, capturedAt);
  if (!nonceResult.ok) return reject(REASONS.nonce[nonceResult.problem]);

  // Step 2: size and decode.
  if (image.size >= MAX_IMAGE_BYTES) return reject(REASONS.tooLarge);
  const buffer = Buffer.from(await image.arrayBuffer());
  if (buffer.length >= MAX_IMAGE_BYTES) return reject(REASONS.tooLarge);
  let mimeType: string | undefined;
  try {
    const meta = await sharp(buffer).metadata();
    mimeType = meta.format ? SHARP_FORMAT_TO_MIME[meta.format] : undefined;
    if (!mimeType || !meta.width || !meta.height) throw new Error(`unsupported format ${meta.format}`);
  } catch {
    return reject(REASONS.undecodable);
  }

  // Step 3: near-duplicate against the last 7 days.
  let imageHash: string;
  try {
    imageHash = await dHash(buffer);
  } catch {
    return reject(REASONS.undecodable);
  }
  const duplicate = findNearDuplicate(imageHash, recentImageHashes(capturedAt - DUPLICATE_WINDOW_MS));
  if (duplicate) return reject(DUPLICATE_REASON, { image_hash: imageHash });

  // Step 4: vision. Spoof is checked before any item is used.
  let extraction: ExtractResult;
  try {
    extraction = await extractPrices(buffer, mimeType);
  } catch (err) {
    console.error(`submit ${observationId}: extraction failed`, err);
    return reject(REASONS.visionFailed, { image_hash: imageHash });
  }
  if (!extraction.is_direct_photo) {
    const reason = extraction.spoof_reason?.trim() || REASONS.spoofDefault;
    return reject(reason, { image_hash: imageHash, confidence: extraction.confidence });
  }
  if (extraction.items.length === 0) {
    return reject(REASONS.noPrices, { image_hash: imageHash, confidence: extraction.confidence });
  }

  const items: SubmitItem[] = extraction.items.map((i) => ({
    item: i.item,
    raw_label: i.raw_label,
    price: i.price,
    currency: i.currency,
    unit: i.unit,
  }));
  const prices: NewPrice[] = items;
  const isReview = extraction.confidence < MIN_CONFIDENCE;

  // Step 5: save the observation and prices.
  try {
    insertObservation(
      {
        ...base,
        image_hash: imageHash,
        confidence: extraction.confidence,
        status: isReview ? "review" : "verified",
        reason: isReview ? REASONS.review : null,
      },
      prices,
    );
  } catch (err) {
    console.error(`submit ${observationId}: could not save observation`, err);
    return jsonError("Could not save the photo, please try again", 500);
  }
  if (isReview) return respond({ status: "review", reason: REASONS.review, observationId, items });

  // Step 6: pay once. claimPayout succeeds at most once per observation.
  if (!claimPayout(observationId)) {
    return respond({ status: "verified", observationId, items });
  }
  try {
    const { signature } = await payContributor({
      recipient: base.contributor,
      observationId,
      imageHash,
      amountBase: PAYOUT_BASE_UNITS,
    });
    recordPayout(observationId, signature);
    return respond({ status: "verified", observationId, items, payoutTx: signature, explorerUrl: txUrl(signature) });
  } catch (err) {
    console.error(`submit ${observationId}: payout failed`, err);
    markPayoutFailed(observationId, REASONS.payoutFailed);
    return respond({ status: "payout_failed", reason: REASONS.payoutFailed, observationId, items });
  }
}
