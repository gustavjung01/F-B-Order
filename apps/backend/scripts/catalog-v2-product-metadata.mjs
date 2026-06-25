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
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
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

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferTeaGroup({ name, sourceGroup }) {
  const product = normalize(name);
  const source = normalize(sourceGroup);

  if (product.startsWith("siro-") || source === "siro") return "siro";
  if (product.startsWith("sinh-to-") || source.startsWith("sinh-to")) return "sinh-to";
  if (product.startsWith("sot-") || source.includes("sot-topping")) return "sot";
  if (product.startsWith("tran-chau-") || product.startsWith("tc-") || source === "tran-chau") return "tran-chau";
  if (product.startsWith("3q-") || source.startsWith("3q")) {
    if (product.includes("thach") || product.includes("thuy-tinh")) return "thach-rau-cau";
    return "3q";
  }
  if (product.includes("thach") || product.includes("rau-cau") || product.includes("thuy-tinh")) return "thach-rau-cau";
  if (product.includes("flan") || product.includes("pudding")) return "flan-pudding";
  if (product.includes("bot-sua") || product.includes("kem-beo") || source.includes("bot-sua")) return "bot-sua-kem-beo";
  if (product.startsWith("bot-") || source.startsWith("bot-")) return "bot-tao-vi";
  if (product.includes("milk-foam") || product.includes("kem-cheese") || product.includes("kem-trung") || product.includes("muoi-bien")) return "milk-foam-kem-cheese";
  if (product.startsWith("sua-") || product.includes("whipping") || product.includes("ice-hot")) return "sua-kem";
  if (product.startsWith("duong-") || source.includes("duong-den")) return "duong-chat-tao-ngot";
  if (product.includes("dao-lon") || product.includes("nhan-") || product.includes("vai-hop") || product.includes("nha-dam")) return "trai-cay-hop";
  if (product.startsWith("tra-") || source.startsWith("tra-")) return "tra";
  return "topping-khac";
}

function validateChoiceGroups(groups, productKey) {
  if (!Array.isArray(groups)) throw new Error(`choiceGroups must be an array for ${productKey}`);
  const keys = new Set();
  for (const group of groups) {
    if (!group || typeof group !== "object") throw new Error(`Invalid choice group for ${productKey}`);
    const key = String(group.key || "").trim();
    const name = String(group.name || "").trim();
    const values = Array.isArray(group.values) ? group.values.map((value) => String(value).trim()).filter(Boolean) : [];
    if (!key || !name || values.length === 0) throw new Error(`Incomplete choice group for ${productKey}`);
    if (keys.has(key)) throw new Error(`Duplicate choice group ${key} for ${productKey}`);
    if (new Set(values).size !== values.length) throw new Error(`Duplicate choice values for ${productKey}/${key}`);
    keys.add(key);
  }
}

export function loadCatalogV2ProductMetadata(repoRoot) {
  const dataDir = path.join(repoRoot, "data/catalog/hung-phat/v2");
  const taxonomy = JSON.parse(fs.readFileSync(path.join(dataDir, "tea-group-taxonomy.json"), "utf8"));
  const metadata = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog-product-metadata.json"), "utf8"));
  const mappingRows = parseCsv(fs.readFileSync(path.join(dataDir, "tea-product-group-map.csv"), "utf8"));

  if (taxonomy.industryKey !== "nguyen-lieu-tra-sua") throw new Error("Unexpected tea taxonomy industry key.");
  if (metadata.version !== 1) throw new Error("Unsupported catalog product metadata version.");

  const validGroups = new Set(taxonomy.groups.map((group) => group.key));
  const approvedGroups = new Map();
  for (const row of mappingRows) {
    const parentKey = String(row.parent_key || "").trim();
    if (!parentKey) continue;
    if (String(row.status || "").trim() !== "APPROVED") throw new Error(`Tea group mapping ${parentKey} is not APPROVED.`);
    const groupKey = String(row.catalog_group_key || "").trim();
    if (!validGroups.has(groupKey)) throw new Error(`Unknown tea group ${groupKey} for ${parentKey}.`);
    approvedGroups.set(parentKey, groupKey);
  }

  const products = new Map();
  const disabledSkus = new Set();
  for (const [productKey, value] of Object.entries(metadata.products || {})) {
    const product = value && typeof value === "object" ? value : {};
    const choiceGroups = product.choiceGroups || [];
    validateChoiceGroups(choiceGroups, productKey);
    if (product.catalogGroupKey && !validGroups.has(product.catalogGroupKey)) {
      throw new Error(`Unknown metadata group ${product.catalogGroupKey} for ${productKey}.`);
    }
    for (const sku of product.disabledSkus || []) disabledSkus.add(String(sku));
    products.set(productKey, product);
  }

  return {
    disabledSkus,
    forProduct(row) {
      const configured = products.get(row.productKey) || {};
      const catalogGroupKey = configured.catalogGroupKey
        || approvedGroups.get(row.productKey)
        || (row.industryKey === taxonomy.industryKey ? inferTeaGroup(row) : null);
      return {
        catalogGroupKey,
        choiceGroups: configured.choiceGroups || [],
        nameOverride: configured.nameOverride || null,
        variantOptions: configured.variantOptions || {},
      };
    },
  };
}
