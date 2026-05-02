#!/usr/bin/env node
// Parses coverage/coverage-summary.json and fails if any metric < threshold.
// Run after: bun run coverage:check (vitest --coverage generates the file).
import { readFileSync } from "fs";

const THRESHOLDS = { lines: 95, branches: 90, functions: 95, statements: 95 };
const summaryPath = new URL("../coverage/coverage-summary.json", import.meta.url);

let summary;
try {
  summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
} catch {
  console.error("coverage/coverage-summary.json not found — run bun run coverage:check first");
  process.exit(1);
}

const total = summary.total;
let failed = false;

for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
  const pct = total[metric]?.pct;
  if (pct === "Unknown") continue; // no files yet — skip
  if (typeof pct === "number" && pct < threshold) {
    console.error(`Coverage FAIL: ${metric} ${pct.toFixed(1)}% < ${threshold}%`);
    failed = true;
  }
}

if (!failed) {
  const line = total.lines?.pct;
  console.log(`Coverage OK: lines=${line === "Unknown" ? "n/a" : line + "%"}`);
}

process.exit(failed ? 1 : 0);
