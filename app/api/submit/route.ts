// Stub for the frontend. The backend replaces this file in T5.
//
// Pick the mock result with the x-mock-result header or a "mock" form field:
// verified (default), review, or rejected.
import { USE_FIXTURES } from "@/lib/config";
import { jsonError, notImplemented } from "@/lib/api";
import { SubmitResponse } from "@/lib/types";
import fixture from "@/fixtures/submit.json";

const results = { verified: fixture.verified, review: fixture.review, rejected: fixture.rejected };
type MockResult = keyof typeof results;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Body must be multipart/form-data", 400);
  for (const field of ["image", "nonce", "wallet", "lat", "lon", "accuracy"]) {
    if (!form.has(field)) return jsonError(`Missing field: ${field}`, 400);
  }
  if (!USE_FIXTURES) return notImplemented();

  const pick = (request.headers.get("x-mock-result") ?? form.get("mock")?.toString() ?? "verified")
    .trim()
    .toLowerCase();
  if (!(pick in results)) {
    return jsonError("Mock result must be verified, review, or rejected", 400);
  }
  return Response.json(SubmitResponse.parse(results[pick as MockResult]));
}
