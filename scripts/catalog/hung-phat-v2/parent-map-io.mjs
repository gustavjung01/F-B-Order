import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCsv } from "./csv-utils.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const dataDir = path.join(root, "data/catalog/hung-phat/v2");
export const outputDir = path.join(dataDir, "generated");
export const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
export const unique = (values) => [...new Set(values)];
export const assert = (condition, message) => { if (!condition) throw new Error(message); };
export const parseJson = (value, fallback = {}) => clean(value) ? JSON.parse(value) : fallback;

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function writeCsv(name, headers, rows) {
  const lines = [headers.join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))];
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), `${lines.join("\n")}\n`, "utf8");
}

export function writeJson(name, value) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// Source-of-truth files consumed by every catalog parent-map build.
export function loadInputs() {
  return {
    products: readCsv(path.join(dataDir, "products.csv")),
    variants: readCsv(path.join(dataDir, "product-variants.csv")),
    parents: readCsv(path.join(dataDir, "parent-definitions.csv")),
    members: [1, 2, 3].flatMap((part) => readCsv(path.join(dataDir, `parent-group-members-${part}.csv`))),
    fixes: JSON.parse(fs.readFileSync(path.join(dataDir, "parent-map-fixes.json"), "utf8")),
  };
}
