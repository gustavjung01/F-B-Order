import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readCsv } from "./csv-utils.mjs";

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

const normalizedDir = path.resolve(getArg("normalized-dir", process.cwd()));
const outputDir = path.resolve(getArg("output-dir", normalizedDir));
const variantsPath = path.join(normalizedDir, "product-variants.csv");

if (!fs.existsSync(variantsPath)) {
  throw new Error(`Missing variants file: ${variantsPath}`);
}

const variants = readCsv(variantsPath);
const invalid = variants.filter((variant) => {
  const raw = String(variant.price_khtt_nghin || "").trim();
  return !/^\d+(\.\d+)?$/.test(raw) || Number(raw) <= 0;
});

fs.mkdirSync(outputDir, { recursive: true });
const reportPath = path.join(outputDir, "price-pending.csv");
const headers = ["sku", "name", "parent_key", "current_price_khtt_nghin", "required_price_vnd"];
const rows = invalid.map((variant) => [
  variant.sku,
  variant.raw_name,
  variant.parent_key,
  variant.price_khtt_nghin,
  "",
]);
const csv = [
  headers.join(","),
  ...rows.map((row) => row.map(csvCell).join(",")),
].join("\r\n");
fs.writeFileSync(reportPath, `\uFEFF${csv}\r\n`, "utf8");

console.log(JSON.stringify({
  phase: 4,
  status: invalid.length ? "PRICE_BLOCKED" : "PRICE_PASS",
  invalidPriceCount: invalid.length,
  invalidPrices: invalid.map((variant) => ({
    sku: variant.sku,
    name: variant.raw_name,
    parentKey: variant.parent_key,
    currentValue: variant.price_khtt_nghin,
  })),
  report: reportPath,
}, null, 2));

if (invalid.length) process.exitCode = 2;
