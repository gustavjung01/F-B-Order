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

function parsePositiveMoneyFromThousands(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const amount = Math.round(Number(raw) * 1000);
  return amount > 0 ? amount : null;
}

function parsePositiveMoneyVnd(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const amount = Math.round(Number(raw));
  return amount > 0 ? amount : null;
}

const normalizedDir = path.resolve(getArg("normalized-dir", process.cwd()));
const outputDir = path.resolve(getArg("output-dir", normalizedDir));
const policyPath = path.resolve(getArg("policy", path.join(process.cwd(), "data/catalog/hung-phat/v2/price-policies.csv")));
const variantsPath = path.join(normalizedDir, "product-variants.csv");

if (!fs.existsSync(variantsPath)) throw new Error(`Missing variants file: ${variantsPath}`);
if (!fs.existsSync(policyPath)) throw new Error(`Missing price policy file: ${policyPath}`);

const variants = readCsv(variantsPath);
const policies = readCsv(policyPath);
const policyBySku = new Map();

for (const policy of policies) {
  if (!policy.sku) throw new Error("Price policy row is missing sku.");
  if (policyBySku.has(policy.sku)) throw new Error(`Duplicate price policy for SKU ${policy.sku}.`);
  if (!["fixed", "market"].includes(policy.price_mode)) {
    throw new Error(`Invalid price_mode for SKU ${policy.sku}: ${policy.price_mode}`);
  }
  policyBySku.set(policy.sku, policy);
}

const variantSkuSet = new Set(variants.map((variant) => variant.sku));
const orphanPolicies = policies.filter((policy) => !variantSkuSet.has(policy.sku));
if (orphanPolicies.length) {
  throw new Error(`Price policies reference unknown SKUs: ${orphanPolicies.map((row) => row.sku).join(", ")}`);
}

const marketItems = [];
const invalidItems = [];

for (const variant of variants) {
  const policy = policyBySku.get(variant.sku);
  if (policy?.price_mode === "market") {
    marketItems.push({
      sku: variant.sku,
      name: variant.raw_name,
      parentKey: variant.parent_key,
      priceMode: "market",
      displayLabel: "Thời giá",
    });
    continue;
  }

  const sourcePrice = parsePositiveMoneyFromThousands(variant.price_khtt_nghin);
  const overridePrice = parsePositiveMoneyVnd(policy?.shop_price_vnd);
  if (sourcePrice === null && overridePrice === null) {
    invalidItems.push({
      sku: variant.sku,
      name: variant.raw_name,
      parentKey: variant.parent_key,
      currentValue: variant.price_khtt_nghin,
      reason: "MISSING_FIXED_PRICE_OR_MARKET_POLICY",
    });
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const reportPath = path.join(outputDir, "price-pending.csv");
const headers = ["sku", "name", "parent_key", "current_value", "required_action"];
const rows = invalidItems.map((item) => [
  item.sku,
  item.name,
  item.parentKey,
  item.currentValue,
  "Nhập giá số hoặc thêm price_mode=market trong price-policies.csv",
]);
const csv = [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n");
fs.writeFileSync(reportPath, `\uFEFF${csv}\r\n`, "utf8");

console.log(JSON.stringify({
  phase: 4,
  status: invalidItems.length ? "PRICE_BLOCKED" : "PRICE_PASS_WITH_MARKET_ITEMS",
  fixedPriceCount: variants.length - marketItems.length - invalidItems.length,
  marketPriceCount: marketItems.length,
  invalidPriceCount: invalidItems.length,
  marketItems,
  invalidPrices: invalidItems,
  report: reportPath,
}, null, 2));

if (invalidItems.length) process.exitCode = 2;
