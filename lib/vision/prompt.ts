// Vision prompt and tool definition for price extraction.
// ML owns this file. Run `npm run eval` after every change (CLAUDE.md rule 6).

export const RECORD_PRICES_TOOL_NAME = "record_prices";

export const SYSTEM_PROMPT = `You read photos of price boards, shelf tags, printed price lists, receipts, and handwritten signs taken in markets and shops. You record what the photo shows by calling the ${RECORD_PRICES_TOOL_NAME} tool exactly once. Do not reply with text.

Reading prices:
- Read only prices that are visible and legible in the image. Never guess, estimate, or fill in a price from general knowledge.
- If nothing is legible, return an empty items list and a low confidence.
- One entry per item and price pair. If an item has several prices (sizes, units), add one entry for each.
- item: the canonical name in English, lowercase, singular, without brand or size. Examples: "tomato", "rice", "palm oil", "egg".
- raw_label: the item text exactly as printed, in its original language and spelling.
- price: a plain number in major currency units (2.99, not 299 cents). Record the price the shopper actually pays.
- Ignore comparison and reference prices: "Comparable Value", "Compare at", "Was", "Reg.", "MSRP", "List price", crossed-out prices, and unit-price fine print. Never record them as items.
- On receipts, record item lines only. Skip subtotal, tax, tip, total, payment, and change lines.
- currency: an ISO 4217 code. Infer it from symbols ($, ₦, €, £, KSh, ₵), words, and context such as language and store. Use "USD" for a bare $ unless context shows another dollar currency.
- unit: the unit the price applies to, normalized to one of "kg", "g", "lb", "oz", "l", "ml", "each", "dozen", "pack", "basket", "bunch", "bag", "bottle", "can". Use "each" when the price is per piece or no unit is shown.

Judging is_direct_photo:
Set is_direct_photo to false when the camera photographed a reproduction instead of the real board, tag, or sign. Look for:
- screen glare, a visible pixel grid or subpixel pattern, moire patterns, scan lines, or backlit glow
- monitor, laptop, tablet, or phone bezels, UI elements, cursors, notification bars
- paper edges, borders, curl, or halftone dots showing the scene is a printed photo
- a flat image of a 3D scene, unnatural perspective, or an image inside an image
When is_direct_photo is false, give a short spoof_reason naming what you saw, such as "laptop bezel and pixel grid visible". Otherwise spoof_reason is null.
Still record any legible items when is_direct_photo is false.

confidence: a number from 0 to 1 for overall legibility and certainty of the items and the is_direct_photo judgment. Use below 0.7 when text is blurry, cut off, or partly hidden, or when you are unsure.`;

export const USER_INSTRUCTION = `Record the prices in this photo with the ${RECORD_PRICES_TOOL_NAME} tool.`;

/** JSON Schema for the tool input. Kept strict-mode compatible: every object lists all keys in
 * required and sets additionalProperties to false. Range checks live in the zod schema in extract.ts. */
export const RECORD_PRICES_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    is_direct_photo: {
      type: "boolean",
      description: "false for photos of screens, monitors, phones, or printed photos",
    },
    spoof_reason: {
      type: ["string", "null"],
      description: "short reason when is_direct_photo is false, otherwise null",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: 'canonical, lowercase, singular, English: "tomato", "rice", "palm oil"' },
          raw_label: { type: "string", description: "the text as printed" },
          price: { type: "number", description: "price in major currency units" },
          currency: { type: "string", description: "ISO 4217 code, inferred from symbols and context" },
          unit: { type: "string", description: '"kg", "lb", "each", "basket", "bunch", "l", ...' },
        },
        required: ["item", "raw_label", "price", "currency", "unit"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number", description: "0 to 1, overall legibility and certainty" },
  },
  required: ["is_direct_photo", "spoof_reason", "items", "confidence"],
  additionalProperties: false,
};

export const RECORD_PRICES_DESCRIPTION =
  "Record every legible item and price in the photo, and whether the photo was taken directly of the real price board rather than of a screen or a printed photo.";
