// Seeds markets from scripts/markets.json into the local SQLite database (upsert by id).
// Usage: npm run seed-markets
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { dbPath, listMarkets, upsertMarket } from "../lib/db";
import { Market } from "../lib/types";

const markets = z.array(Market).parse(JSON.parse(readFileSync(resolve(__dirname, "markets.json"), "utf8")));
for (const m of markets) upsertMarket(m);
console.log(`Seeded ${markets.length} markets into ${dbPath()}`);
for (const m of listMarkets()) console.log(`  ${m.id}  ${m.name}  (${m.lat}, ${m.lon}) r=${m.radius_m}m`);
