// Checks .env.local (or the process environment) against lib/env.ts.
// Prints only "OK" or the names of missing/invalid variables. Never prints values.
import { getEnv } from "../lib/env";

try {
  getEnv();
  console.log("OK");
} catch (err) {
  const message = err instanceof Error ? err.message : "";
  // getEnv's error lists only variable names and fixed reasons, never values.
  if (message.startsWith("Invalid environment configuration")) {
    console.log(message);
  } else {
    console.log("Environment check failed for an unexpected reason.");
  }
  process.exit(1);
}
