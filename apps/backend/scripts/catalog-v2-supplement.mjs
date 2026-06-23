import fs from "node:fs";
import path from "node:path";

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  ));
}

function positiveMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

function parseOptions(raw) {
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

export function loadCatalogV2Supplement(repoRoot) {
  const filePath = path.join(repoRoot, "data/catalog/hung-phat/v2/product-variants.csv");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Catalog v2 supplement is missing: ${filePath}`);
  }

  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  const bySku = new Map();

  for (const row of rows) {
    const sku = String(row.sku || "").trim();
    if (!sku) throw new Error("Catalog v2 supplement contains a blank SKU.");
    if (bySku.has(sku)) throw new Error(`Duplicate supplement SKU: ${sku}`);

    bySku.set(sku, {
      sku,
      options: parseOptions(row.options_json),
      dealerPrice: positiveMoney(row.price),
    });
  }

  return bySku;
}
