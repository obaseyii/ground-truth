// T3 eval: run extractPrices on every photo in eval/expected.json and score it.
// Usage: npm run eval
// A file passes when every expected item matches an extracted item (price within 1 percent, then a
// lenient name check), no extracted item has a forbidden price, and is_direct_photo equals expected.direct.
// Extra extracted items are listed but not penalized.
// Exit code 1 unless at least PASS_MARK files pass and every screen or print photo is flagged as not direct.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractPrices, type ExtractResult } from "../lib/vision/extract";

const PASS_MARK = 4;
const EVAL_DIR = "eval";
const PHOTO_DIR = path.join(EVAL_DIR, "photos");

type ExpectedItem = { item: string; price: number; currency: string; unit: string };
// forbidden_prices: the photo fails if any extracted item has one of these prices (e.g. a "Comparable Value").
type ExpectedFile = { file: string; direct: boolean; items: ExpectedItem[]; forbidden_prices?: number[] };

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

const priceClose = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 0.01;

// Lowercase, collapse whitespace, and drop a plural "s" from each word ("tomatoes" -> "tomatoe").
const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");

// Lenient: match when either normalized name contains the other ("lotion" vs "body lotion").
const nameMatch = (a: string, b: string) => {
  const x = normName(a);
  const y = normName(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
};

type GotItem = ExtractResult["items"][number];

/** Price within 1 percent first, then the lenient name check. Each extracted item matches at most once. */
function scoreItems(expected: ExpectedItem[], got: GotItem[]) {
  const used = new Set<number>();
  const missing: ExpectedItem[] = [];
  for (const e of expected) {
    const idx = got.findIndex((g, i) => !used.has(i) && priceClose(g.price, e.price) && nameMatch(g.item, e.item));
    if (idx === -1) missing.push(e);
    else used.add(idx);
  }
  const extras = got.filter((_, i) => !used.has(i));
  return { matched: expected.length - missing.length, missing, extras };
}

const fmt = (i: { item: string; price: number; currency: string; unit: string }) =>
  `${i.item} ${i.price} ${i.currency}/${i.unit}`;

async function main() {
  const expected: ExpectedFile[] = JSON.parse(await readFile(path.join(EVAL_DIR, "expected.json"), "utf8"));

  const rows: string[][] = [];
  const notes: string[] = [];
  let passed = 0;
  let spoofTotal = 0;
  let spoofFlagged = 0;

  for (const exp of expected) {
    const mime = MIME_BY_EXT[path.extname(exp.file).toLowerCase()] ?? "image/jpeg";
    if (!exp.direct) spoofTotal++;
    try {
      const image = await readFile(path.join(PHOTO_DIR, exp.file));
      const started = Date.now();
      const got = await extractPrices(image, mime);
      const secs = ((Date.now() - started) / 1000).toFixed(1);

      const { matched, missing, extras } = scoreItems(exp.items, got.items);
      const forbidden = got.items.filter((g) => (exp.forbidden_prices ?? []).some((p) => priceClose(g.price, p)));
      const itemsOk = missing.length === 0 && forbidden.length === 0;
      const directOk = got.is_direct_photo === exp.direct;
      const pass = itemsOk && directOk;
      if (pass) passed++;
      if (!exp.direct && !got.is_direct_photo) spoofFlagged++;

      rows.push([
        exp.file,
        `${matched}/${exp.items.length}`,
        itemsOk ? "ok" : "FAIL",
        `${exp.direct}/${got.is_direct_photo}`,
        directOk ? "ok" : "FAIL",
        got.confidence.toFixed(2),
        `${secs}s`,
        pass ? "PASS" : "FAIL",
      ]);

      notes.push(`${exp.file}: extracted ${got.items.map(fmt).join(", ") || "(none)"}`);
      for (const m of missing) notes.push(`${exp.file}:   missing ${fmt(m)}`);
      for (const f of forbidden) notes.push(`${exp.file}:   FORBIDDEN price recorded: ${fmt(f)}`);
      for (const x of extras) notes.push(`${exp.file}:   extra (not penalized): ${fmt(x)}`);
      if (got.spoof_reason) notes.push(`${exp.file}:   spoof_reason: ${got.spoof_reason}`);
    } catch (err) {
      rows.push([exp.file, "-", "ERROR", "-", "ERROR", "-", "-", "FAIL"]);
      notes.push(`${exp.file}: error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  printTable(["file", "items", "item+price", "direct exp/got", "direct", "conf", "time", "result"], rows);
  console.log("\nDetails:");
  for (const n of notes) console.log(`  ${n}`);

  const total = expected.length;
  const passOk = passed >= PASS_MARK;
  const spoofOk = spoofFlagged === spoofTotal;
  console.log(`\nPassed both checks: ${passed}/${total} (need ${PASS_MARK})  ${passOk ? "ok" : "FAIL"}`);
  console.log(`Screen or print photos flagged not direct: ${spoofFlagged}/${spoofTotal} (need all)  ${spoofOk ? "ok" : "FAIL"}`);
  console.log(passOk && spoofOk ? "\nEVAL PASS" : "\nEVAL FAIL");
  if (!(passOk && spoofOk)) process.exitCode = 1;
}

function printTable(header: string[], rows: string[][]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
