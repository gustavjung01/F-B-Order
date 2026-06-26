import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyParentFixes } from "../../../scripts/catalog/hung-phat-v2/parent-map-apply.mjs";
import { finalizeParentMap } from "../../../scripts/catalog/hung-phat-v2/parent-map-finalize.mjs";
import { loadInputs, parseJson } from "../../../scripts/catalog/hung-phat-v2/parent-map-io.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const selectorPath = path.join(repoRoot, "apps/frontend/components/catalog/CompactPurchaseSelector.tsx");
const selectorSource = fs.readFileSync(selectorPath, "utf8");

assert.equal(selectorSource.includes("<select"), false, "Purchase selector must not use dropdowns.");
assert.equal(selectorSource.includes('<option value="">Chọn</option>'), false, "Purchase selector must not show an empty Chọn option.");
assert.ok(selectorSource.includes("ChoiceButtons"), "Purchase selector must render visible direct-choice buttons.");

const result = finalizeParentMap(applyParentFixes(loadInputs()));
const membersByParent = new Map();
for (const row of result.variants) {
  if (!membersByParent.has(row.parent_key)) membersByParent.set(row.parent_key, []);
  membersByParent.get(row.parent_key).push(row);
}

const validSelectorKeys = new Set(["size", "flavor", "flavor_or_type"]);
const audits = [];
for (const parent of result.parents) {
  const members = membersByParent.get(parent.parent_key) || [];
  if (members.length <= 1) continue;
  const optionGroups = parseJson(parent.option_groups_json, []);
  const optionValues = Object.fromEntries(optionGroups.map((key) => [
    key,
    [...new Set(members.map((row) => parseJson(row.options_json, {})[key]).filter(Boolean))],
  ]));
  for (const [key, values] of Object.entries(optionValues)) {
    assert.ok(values.length > 1, `${parent.parent_key}/${key} must contain at least two values.`);
  }
  audits.push({
    parentKey: parent.parent_key,
    name: parent.name,
    variants: members.length,
    mode: optionGroups.every((key) => validSelectorKeys.has(key)) ? "SIZE_OR_FLAVOR" : "DIRECT_VARIANT_BUTTONS",
    optionGroups,
    optionValues,
  });
}

const laroseMembers = result.variants.filter((row) => ["BGKQ-0132", "BGKQ-0133"].includes(row.sku));
assert.equal(laroseMembers.length, 2, "Larose must contain exactly BGKQ-0132 and BGKQ-0133.");
assert.equal(new Set(laroseMembers.map((row) => row.parent_key)).size, 1, "Larose variants must share one parent card.");
const laroseAudit = audits.find((row) => row.parentKey === laroseMembers[0].parent_key);
assert.ok(laroseAudit, "Larose parent audit is missing.");
assert.equal(laroseAudit.mode, "DIRECT_VARIANT_BUTTONS", "Larose must use direct variant buttons, not size/flavor selectors.");
assert.equal(laroseAudit.optionGroups.includes("size"), false, "Larose has one size and must not expose a size selector.");

const summary = {
  status: "CATALOG_PURCHASE_SELECTOR_AUDIT_PASS",
  totalProducts: result.variants.length,
  multiVariantCards: audits.length,
  sizeOrFlavorCards: audits.filter((row) => row.mode === "SIZE_OR_FLAVOR").length,
  directVariantCards: audits.filter((row) => row.mode === "DIRECT_VARIANT_BUTTONS").length,
  larose: laroseAudit,
  directVariantExamples: audits.filter((row) => row.mode === "DIRECT_VARIANT_BUTTONS").slice(0, 20),
};

console.log(JSON.stringify(summary, null, 2));
