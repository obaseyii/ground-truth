// Writes the public data feed as static files for the website:
//   public/data/observations.json  same array as GET /api/observations (verified, newest first, max 500)
//   public/data/stats.json         { verified, usdcPaid, blocked, updatedAt }
// Usage: npm run export-observations
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dbPath, getStats, listFeed } from "../lib/db";
import { FeedStats, ObservationsResponse } from "../lib/types";

const outDir = resolve(__dirname, "..", "public", "data");
mkdirSync(outDir, { recursive: true });

const observations = ObservationsResponse.parse(listFeed());
const stats = FeedStats.parse({ ...getStats(), updatedAt: new Date().toISOString() });

writeFileSync(join(outDir, "observations.json"), JSON.stringify(observations, null, 2) + "\n");
writeFileSync(join(outDir, "stats.json"), JSON.stringify(stats, null, 2) + "\n");

console.log(`Read ${dbPath()}`);
console.log(`Wrote ${observations.length} records to public/data/observations.json`);
console.log(`Wrote public/data/stats.json: ${JSON.stringify(stats)}`);
