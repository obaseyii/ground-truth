import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { z } from "zod";
import { getEnv } from "../env";
import {
  RECORD_PRICES_DESCRIPTION,
  RECORD_PRICES_INPUT_SCHEMA,
  RECORD_PRICES_TOOL_NAME,
  SYSTEM_PROMPT,
  USER_INSTRUCTION,
} from "./prompt";

const MAX_SIDE_PX = 1600;
const JPEG_QUALITY = 85;

export const extractedItemSchema = z.object({
  item: z.string().trim().min(1),
  raw_label: z.string(),
  price: z.number().finite().nonnegative(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "currency must be an ISO 4217 code").transform((c) => c.toUpperCase()),
  unit: z.string().trim().min(1),
});

export const extractResultSchema = z.object({
  is_direct_photo: z.boolean(),
  spoof_reason: z.string().nullable(),
  items: z.array(extractedItemSchema),
  confidence: z.number().min(0).max(1),
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ExtractResult = z.infer<typeof extractResultSchema>;

export class ExtractionError extends Error {}

const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]);

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) {
    const env = getEnv("ANTHROPIC_API_KEY");
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Rotates by EXIF, fits within 1600 px on the long side, and re-encodes as JPEG quality 85. */
export async function prepareImage(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Extracts item prices from a photo and judges whether it is a direct photo.
 * Retries once when the model output fails schema validation, then throws ExtractionError.
 * API errors (auth, rate limit, network) propagate as Anthropic SDK errors.
 */
export async function extractPrices(image: Buffer, mimeType: string): Promise<ExtractResult> {
  if (!SUPPORTED_MIME.has(mimeType.toLowerCase())) {
    throw new ExtractionError(`Unsupported image type: ${mimeType}`);
  }
  const env = getEnv("ANTHROPIC_API_KEY");
  const jpeg = await prepareImage(image);
  const data = jpeg.toString("base64");

  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await callModel(env.VISION_MODEL, data);
    const parsed = parseResponse(response);
    if (parsed.ok) return parsed.result;
    lastProblem = parsed.problem;
  }
  throw new ExtractionError(`Vision output failed validation after a retry: ${lastProblem}`);
}

async function callModel(model: string, base64Jpeg: string): Promise<Anthropic.Message> {
  const tool: Anthropic.Tool = {
    name: RECORD_PRICES_TOOL_NAME,
    description: RECORD_PRICES_DESCRIPTION,
    input_schema: RECORD_PRICES_INPUT_SCHEMA,
    strict: true,
  };
  return getClient().messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [tool],
    // Forced tool_choice ({type: "tool"}) returns a 400 on current models (Opus 5.5, Sonnet 5.5,
    // Fable 5.1). "auto" plus strict: true and the prompt instruction gives one schema-valid call;
    // a response without the call counts as a validation failure and is retried.
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } },
          { type: "text", text: USER_INSTRUCTION },
        ],
      },
    ],
  });
}

type Parsed = { ok: true; result: ExtractResult } | { ok: false; problem: string };

function parseResponse(response: Anthropic.Message): Parsed {
  if (response.stop_reason === "refusal") {
    return { ok: false, problem: `model refused (${response.stop_details?.category ?? "no category"})` };
  }
  if (response.stop_reason === "max_tokens") {
    return { ok: false, problem: "response hit max_tokens" };
  }
  const call = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === RECORD_PRICES_TOOL_NAME,
  );
  if (!call) return { ok: false, problem: `no ${RECORD_PRICES_TOOL_NAME} tool call in response` };

  const result = extractResultSchema.safeParse(call.input);
  if (!result.success) {
    return { ok: false, problem: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, result: result.data };
}
