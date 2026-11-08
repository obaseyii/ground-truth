import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Empty strings ("KEY=" in .env.local) count as unset.
const optional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);
const required = z.string().trim().min(1);

const schema = z.object({
  // Allowed empty for now (filled in during later tasks).
  ANTHROPIC_API_KEY: optional,
  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  USDC_MINT: optional,
  TREASURY_SECRET_KEY: optional, // JSON array, used on Vercel only

  // Local keypair paths. On Vercel, TREASURY_SECRET_KEY replaces the treasury path
  // (checked in getEnv), and the agent keypair is only used by local scripts.
  TREASURY_KEYPAIR_PATH: optional,
  AGENT_KEYPAIR_PATH: optional,

  // Always required.
  SOLANA_RPC_URL: required,
  ADMIN_KEY: required,
  VISION_MODEL: required,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validates environment variables on first call and caches the result.
 * Throws an error naming every missing or invalid variable.
 */
export function getEnv(): Env {
  if (cached) return cached;

  // Next.js loads .env.local itself. Scripts run with tsx do not, so load it here.
  // Existing process.env values are never overridden.
  loadDotenv({ path: ".env.local", quiet: true });

  const isSet = (name: string) => (process.env[name] ?? "").trim() !== "";
  const result = schema.safeParse(process.env);
  const problems: string[] = result.success
    ? []
    : result.error.issues.map((issue) => {
        const name = String(issue.path[0] ?? "env");
        return isSet(name) ? `  - ${name}: ${issue.message}` : `  - ${name}: missing`;
      });

  if (!isSet("TREASURY_SECRET_KEY") && !isSet("TREASURY_KEYPAIR_PATH")) {
    problems.push("  - TREASURY_KEYPAIR_PATH: missing (or set TREASURY_SECRET_KEY on Vercel)");
  }
  if (/mainnet/i.test(process.env.SOLANA_RPC_URL ?? "")) {
    problems.push("  - SOLANA_RPC_URL: must point at devnet, never mainnet");
  }

  if (!result.success || problems.length > 0) {
    throw new Error(
      `Invalid environment configuration (check .env.local or Vercel settings):\n${problems.join("\n")}`,
    );
  }

  cached = result.data;
  return cached;
}
