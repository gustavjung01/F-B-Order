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
const imageMode = arg("image-mode", "r2");
const assetBaseUrl = arg(
  "asset-base-url",
  process.env.CATALOG_ASSET_BASE_URL || "https://cdn.bepsi.click",
).replace(/\/+$/, "");
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

assert(["r2", "local"].includes(imageMode), `Unsupported image mode: ${imageMode}.`);
assert(variants.length === 275, `Expected 275 variants, found ${variants.length}.`);
assert(cards.reduce((sum, card) => sum + card.variantCount, 0) === variants.length, "Preview variant coverage mismatch.");
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

let copiedImageCount = 0;
if (imageMode === "local") {
  assert(fs.existsSync(sourceImages), `Local image source does not exist: ${sourceImages}`);
  fs.mkdirSync(assetsDir, { recursive: true });
  const copiedKeys = new Set();
  for (const variant of variants) {
    if (variant.image_status === "MISSING" || copiedKeys.has(variant.image_key)) continue;
    const source = path.join(sourceImages, `${variant.image_key}.webp`);
    assert(fs.existsSync(source), `Missing mapped local image: ${source}.`);
    fs.copyFileSync(source, path.join(assetsDir, `${variant.image_key}.webp`));
    copiedKeys.add(variant.image_key);
  }
  copiedImageCount = copiedKeys.size;
}

const imageUrlFor = (imageKey, imageStatus) => {
  if (!imageKey || imageStatus === "MISSING") return "";
  if (imageMode === "local") return `./assets/${imageKey}.webp`;
  return `${assetBaseUrl}/catalog/hung-phat/v2/products/${imageKey}.webp`;
};
for (const card of cards) {
  card.imageUrl = imageUrlFor(card.imageKey, card.imageStatus === "missing" ? "MISSING" : "MAPPED");
  for (const variant of card.variants) {
    variant.imageUrl = imageUrlFor(variant.imageKey, variant.imageStatus);
  }
}

const payload = {
  catalogVersion: "hung-phat-v2-parent-audit",
  generatedAt: new Date().toISOString(),
  expectedCardCount: cards.length,
  variantCount: variants.length,
  imageMode,
  assetBaseUrl: imageMode === "r2" ? assetBaseUrl : null,
  products: cards,
};
const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
const template = fs.readFileSync(path.join(scriptDir, "phase3-preview.template.html"), "utf8");
fs.writeFileSync(path.join(outputDir, "index.html"), template.replace("__CATALOG_PAYLOAD__", safeJson), "utf8");

fs.copyFileSync(path.join(scriptDir, "phase3-preview.css"), path.join(outputDir, "preview.css"));
fs.copyFileSync(path.join(scriptDir, "phase3-mobile.css"), path.join(outputDir, "mobile.css"));
fs.copyFileSync(path.join(scriptDir, "phase3-filter-order.js"), path.join(outputDir, "filter-order.js"));
const previewScript = fs.readFileSync(path.join(scriptDir, "phase3-preview.js"), "utf8")
  .replace(
    "url: `./assets/${variant.imageKey}.webp`,",
    "url: variant.imageUrl || `./assets/${variant.imageKey}.webp`,",
  );
fs.writeFileSync(path.join(outputDir, "preview.js"), previewScript, "utf8");

console.log(JSON.stringify({
  status: "PASS",
  parentCardCount: cards.length,
  variantCount: variants.length,
  imageMode,
  assetBaseUrl: imageMode === "r2" ? assetBaseUrl : null,
  copiedImageCount,
  missingImageCount: variants.filter((row) => row.image_status === "MISSING").length,
  output: path.join(outputDir, "index.html"),
}, null, 2));
