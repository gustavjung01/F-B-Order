import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readCsv } from "./csv-utils.mjs";
import { buildPreviewCards } from "./parent-preview-model.mjs";
import { assert, dataDir, root } from "./parent-map-io.mjs";

const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const normalizedDir = path.resolve(arg("normalized-dir", path.join(dataDir, "generated")));
const sourceImages = path.resolve(arg(
  "source-images",
  "F:/1_A_Disk_D/khuong-binh/bep-si/image/bepsi-link-mapper/bepsi_link_mapper/catalog-v2/preview/assets",
));
const outputDir = path.join(root, "artifacts/catalog/hung-phat-v2-preview");
const assetsDir = path.join(outputDir, "assets");
const scriptDir = path.join(root, "scripts/catalog/hung-phat-v2");
const parents = readCsv(path.join(normalizedDir, "product-parents.csv"));
const variants = readCsv(path.join(normalizedDir, "product-variants.csv"));
const cards = buildPreviewCards(parents, variants);

assert(variants.length === 275, `Expected 275 variants, found ${variants.length}.`);
assert(cards.reduce((sum, card) => sum + card.variantCount, 0) === variants.length, "Preview variant coverage mismatch.");
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });

const availableKeys = new Set();
for (const variant of variants) {
  if (variant.image_status === "MISSING" || availableKeys.has(variant.image_key)) continue;
  const source = path.join(sourceImages, `${variant.image_key}.webp`);
  assert(fs.existsSync(source), `Missing mapped image ${source}.`);
  fs.copyFileSync(source, path.join(assetsDir, `${variant.image_key}.webp`));
  availableKeys.add(variant.image_key);
}
for (const card of cards) {
  card.imageUrl = availableKeys.has(card.imageKey) ? `./assets/${card.imageKey}.webp` : "";
}

const payload = {
  catalogVersion: "hung-phat-v2-parent-audit",
  generatedAt: new Date().toISOString(),
  expectedCardCount: cards.length,
  variantCount: variants.length,
  products: cards,
};
const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
const template = fs.readFileSync(path.join(scriptDir, "phase3-preview.template.html"), "utf8");
fs.writeFileSync(path.join(outputDir, "index.html"), template.replace("__CATALOG_PAYLOAD__", safeJson), "utf8");
for (const [source, target] of [
  ["phase3-preview.css", "preview.css"],
  ["phase3-mobile.css", "mobile.css"],
  ["phase3-preview.js", "preview.js"],
  ["phase3-filter-order.js", "filter-order.js"],
]) fs.copyFileSync(path.join(scriptDir, source), path.join(outputDir, target));

console.log(JSON.stringify({
  status: "PASS",
  parentCardCount: cards.length,
  variantCount: variants.length,
  copiedImageCount: availableKeys.size,
  missingImageCount: variants.filter((row) => row.image_status === "MISSING").length,
  output: path.join(outputDir, "index.html"),
}, null, 2));
