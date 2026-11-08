// Perceptual difference hash (dHash): grayscale, resize to 9x8, compare adjacent pixels.
import sharp from "sharp";

export const DUPLICATE_MAX_DISTANCE = 6;
export const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DUPLICATE_REASON = "This photo was already submitted";

/** 64-bit dHash as 16 hex characters. */
export async function dHash(image: Buffer): Promise<string> {
  const px = await sharp(image)
    .rotate()
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();
  let bits = BigInt(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << BigInt(1)) | (px[y * 9 + x] < px[y * 9 + x + 1] ? BigInt(1) : BigInt(0));
    }
  }
  return bits.toString(16).padStart(16, "0");
}

/** Number of differing bits between two 16-hex-character hashes. */
export function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x > BigInt(0)) {
    count += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return count;
}

/** First hash within DUPLICATE_MAX_DISTANCE of `hash`, or undefined. */
export function findNearDuplicate<T extends { image_hash: string }>(hash: string, candidates: T[]): T | undefined {
  return candidates.find((c) => hamming(hash, c.image_hash) <= DUPLICATE_MAX_DISTANCE);
}
