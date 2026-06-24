import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { applyParentFixes } from "./parent-map-apply.mjs";
import { finalizeParentMap } from "./parent-map-finalize.mjs";
import { loadInputs, root } from "./parent-map-io.mjs";

const outputDir = path.resolve(
  process.argv.find((value) => value.startsWith("--output-dir="))?.slice("--output-dir=".length)
    || path.join(root, "artifacts/catalog/hung-phat-v2-content-audit"),
);
const result = finalizeParentMap(applyParentFixes(loadInputs()));
const missing = result.variants.filter((row) => row.image_status === "MISSING");
const groupedParents = result.parents.filter((row) => row.option_groups_json !== "[]");

if (result.variants.length !== 275) throw new Error(`Expected 275 variants, found ${result.variants.length}.`);
if (result.parents.length !== 159) throw new Error(`Expected 159 parent cards, found ${result.parents.length}.`);
if (missing.length !== 0) throw new Error(`Expected no missing images, found ${missing.length}.`);

fs.mkdirSync(outputDir, { recursive: true });
const summary = {
  status: "PASS",
  parentCardCount: result.parents.length,
  variantCount: result.variants.length,
  groupedParentCount: groupedParents.length,
  resolvedImageCount: result.resolvedImageCount,
  missingImageCount: missing.length,
};
fs.writeFileSync(path.join(outputDir, "audit-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const rows = [
  "parent_key,name,brand,cover_image_key,option_groups_json",
  ...groupedParents.map((row) => [
    row.parent_key,
    row.name,
    row.brand,
    row.cover_image_key,
    row.option_groups_json,
  ].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")),
];
fs.writeFileSync(path.join(outputDir, "grouped-parent-cards.csv"), `${rows.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
