import fs from "node:fs";
import path from "node:path";
import { applyParentFixes } from "./parent-map-apply.mjs";
import { finalizeParentMap } from "./parent-map-finalize.mjs";
import {
  assert,
  clean,
  dataDir,
  loadInputs,
  outputDir,
  unique,
  writeCsv,
  writeJson,
} from "./parent-map-io.mjs";
import { readCsv } from "./csv-utils.mjs";

const TEA_INDUSTRY_KEY = "nguyen-lieu-tra-sua";
const taxonomyPath = path.join(dataDir, "tea-group-taxonomy.json");
const mappingPath = path.join(dataDir, "tea-product-group-map.csv");

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function industryFor(sourceGroup) {
  const value = normalize(sourceGroup);
  if (value.includes("my-cay") || value.includes("mi-cay")) return "nguyen-lieu-mi-cay";
  if (value.includes("dong-lanh")) return "dong-lanh";
  if (value.includes("banh-trang")) return "nguyen-lieu-banh-trang";
  if (
    value.includes("ong-hut")
    || value.includes("muong")
    || value.includes("nap")
    || value.includes("bao-ly")
  ) return "bao-bi";
  return TEA_INDUSTRY_KEY;
}

assert(fs.existsSync(taxonomyPath), `Missing tea taxonomy: ${taxonomyPath}`);
assert(fs.existsSync(mappingPath), `Missing tea mapping source: ${mappingPath}`);

const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, "utf8"));
assert(taxonomy.version === 1, `Unsupported tea taxonomy version: ${taxonomy.version}`);
assert(taxonomy.industryKey === TEA_INDUSTRY_KEY, `Unexpected tea industry key: ${taxonomy.industryKey}`);
assert(taxonomy.mappingPolicy === "manual-review-only", "Tea group mapping must stay manual-review-only.");
assert(Array.isArray(taxonomy.groups) && taxonomy.groups.length > 0, "Tea taxonomy has no groups.");

const groupKeys = taxonomy.groups.map((group) => clean(group.key));
assert(groupKeys.every(Boolean), "Tea taxonomy contains a blank group key.");
assert(unique(groupKeys).length === groupKeys.length, "Tea taxonomy contains duplicate group keys.");
const groupByKey = new Map(taxonomy.groups.map((group) => [group.key, group]));

const mappingRows = readCsv(mappingPath).filter((row) => clean(row.parent_key));
const mappingParentKeys = mappingRows.map((row) => clean(row.parent_key));
assert(unique(mappingParentKeys).length === mappingParentKeys.length, "Tea mapping contains duplicate parent_key values.");
for (const row of mappingRows) {
  assert(clean(row.status) === "APPROVED", `Mapping ${row.parent_key} must have status APPROVED.`);
  assert(groupByKey.has(clean(row.catalog_group_key)), `Unknown tea group ${row.catalog_group_key} for ${row.parent_key}.`);
  assert(clean(row.catalog_group_key) !== "chua-phan-nhom", `Approved mapping ${row.parent_key} cannot use chua-phan-nhom.`);
}

const result = finalizeParentMap(applyParentFixes(loadInputs()));
const variantsByParent = new Map();
for (const variant of result.variants) {
  const rows = variantsByParent.get(variant.parent_key) || [];
  rows.push(variant);
  variantsByParent.set(variant.parent_key, rows);
}

const teaParents = [];
for (const parent of result.parents) {
  const variants = variantsByParent.get(parent.parent_key) || [];
  assert(variants.length > 0, `Parent ${parent.parent_key} has no variants.`);
  const industryKeys = unique(variants.map((variant) => industryFor(variant.source_group)));
  assert(industryKeys.length === 1, `Parent ${parent.parent_key} mixes industries: ${industryKeys.join(", ")}`);
  if (industryKeys[0] === TEA_INDUSTRY_KEY) teaParents.push({ parent, variants });
}

const teaParentKeys = new Set(teaParents.map(({ parent }) => parent.parent_key));
for (const row of mappingRows) {
  assert(teaParentKeys.has(clean(row.parent_key)), `Mapping ${row.parent_key} is not a current tea ingredient parent.`);
}

const mappingByParent = new Map(mappingRows.map((row) => [clean(row.parent_key), row]));
const auditRows = teaParents.map(({ parent, variants }) => {
  const mapping = mappingByParent.get(parent.parent_key);
  const group = mapping ? groupByKey.get(clean(mapping.catalog_group_key)) : null;
  return {
    parent_key: parent.parent_key,
    current_name: parent.name,
    brand: parent.brand || "",
    current_source_groups: unique(variants.map((variant) => clean(variant.source_group))).join(" | "),
    variant_count: String(variants.length),
    skus: variants.map((variant) => variant.sku).join(" | "),
    catalog_group_key: mapping?.catalog_group_key || "",
    catalog_group_name: group?.name || "",
    mapping_status: mapping ? "APPROVED" : "REVIEW_REQUIRED",
    reviewer_note: mapping?.note || "",
  };
});

writeCsv("tea-product-group-audit.csv", [
  "parent_key",
  "current_name",
  "brand",
  "current_source_groups",
  "variant_count",
  "skus",
  "catalog_group_key",
  "catalog_group_name",
  "mapping_status",
  "reviewer_note",
], auditRows);

const summary = {
  status: "PASS",
  taxonomyVersion: taxonomy.version,
  industryKey: TEA_INDUSTRY_KEY,
  groupCount: taxonomy.groups.length,
  customerVisibleGroupCount: taxonomy.groups.filter((group) => group.customerVisible).length,
  teaParentCount: teaParents.length,
  approvedMappingCount: mappingRows.length,
  reviewRequiredCount: teaParents.length - mappingRows.length,
  otherIndustriesModified: false,
  output: path.join(outputDir, "tea-product-group-audit.csv"),
};

writeJson("tea-product-group-audit-summary.json", summary);
console.log(JSON.stringify(summary, null, 2));
