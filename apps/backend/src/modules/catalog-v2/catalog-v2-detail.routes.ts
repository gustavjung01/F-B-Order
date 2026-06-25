import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import { anonymousIdentity, type RequestIdentity } from "../auth/auth.identity";
import { evaluateCatalogV2Pricing, type CatalogV2PriceRow } from "./catalog-v2.pricing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_ASSET_BASE_URL = "https://cdn.bepsi.click";

const OPTION_LABELS: Record<string, string> = {
  flavor: "Vị",
  flavor_or_type: "Vị / loại",
  type: "Loại",
  color: "Màu",
  size: "Dung tích / khối lượng",
};

const OPTION_ORDER = ["size", "type", "flavor", "flavor_or_type", "color"];
const NON_SELECTABLE_KEYS = new Set(["package", "sell_unit"]);

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

type VariantRow = CatalogV2PriceRow & {
  variant_id: string;
  product_id: string;
  product_key: string;
  product_name: string;
  brand: string | null;
  industry: string;
  industry_key: string;
  catalog_group_key: string | null;
  subcategory: string | null;
  option_groups: unknown;
  choice_groups: unknown;
  cover_image_key: string | null;
  cover_image_object_key: string | null;
  variant_key: string;
  sku: string;
  variant_name: string;
  options: unknown;
  image_key: string | null;
  image_object_key: string | null;
  sort_order: number;
};

function assetUrl(objectKey: string | null) {
  if (!objectKey) return null;
  const base = (process.env.R2_PUBLIC_BASE_URL || process.env.CATALOG_ASSET_BASE_URL || DEFAULT_ASSET_BASE_URL).trim();
  return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canonicalOptionKey(value: string) {
  const key = normalizeKey(value);
  const aliases: Record<string, string> = {
    vi: "flavor",
    huong_vi: "flavor",
    flavour: "flavor",
    flavor: "flavor",
    vi_loai: "flavor_or_type",
    flavor_or_type: "flavor_or_type",
    loai: "type",
    type: "type",
    mau: "color",
    color: "color",
    dung_tich: "size",
    khoi_luong: "size",
    trong_luong: "size",
    volume: "size",
    weight: "size",
    capacity: "size",
    size: "size",
    quy_cach: "package",
    quy_cach_dong_goi: "package",
    package: "package",
    don_vi_ban: "sell_unit",
    dvt: "sell_unit",
    sell_unit: "sell_unit",
  };
  return aliases[key] || key;
}

function displayValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const labels: Record<string, string> = {
    dau: "Dâu",
    dao: "Đào",
    oi: "Ổi",
    "viet quoc": "Việt quất",
    "chanh day": "Chanh dây",
    vai: "Vải",
    kiwi: "Kiwi",
    "phuc bon tu": "Phúc bồn tử",
    xoai: "Xoài",
    nho: "Nho",
    "dau tam": "Dâu tằm",
    khom: "Khóm",
    "mang cau": "Mãng cầu",
    trang: "Trắng",
    den: "Đen",
    "duong den": "Đường đen",
    "hoang kim": "Hoàng kim",
    cafe: "Cà phê",
    olong: "Ô long",
    socola: "Sô-cô-la",
    mon: "Môn",
    trung: "Trứng",
    dua: "Dừa",
    lai: "Lài",
    hong: "Hồng trà",
    gao: "Gạo",
    nau: "Nâu",
    khac: "Khác",
  };
  const normalized = value.replace(/-/g, " ").trim().toLowerCase();
  return labels[normalized] || value.trim();
}

function displayOptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const nextValue = displayValue(rawValue);
    if (typeof nextValue !== "string" || !nextValue) continue;
    const key = canonicalOptionKey(rawKey);
    if (!result[key] || result[key] === "Khác") result[key] = nextValue;
  }
  return result;
}

function displayChoiceValues(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(displayValue).filter((item): item is string => typeof item === "string" && Boolean(item)))]
    : [];
}

function normalizeChoiceGroups(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((group) => {
    if (!group || typeof group !== "object") return [];
    const raw = group as {
      key?: unknown;
      name?: unknown;
      required?: unknown;
      values?: unknown;
      valuesBySku?: unknown;
    };
    const key = typeof raw.key === "string" ? canonicalOptionKey(raw.key) : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const values = displayChoiceValues(raw.values);
    if (!key || !name || values.length === 0) return [];

    const valuesBySku = raw.valuesBySku && typeof raw.valuesBySku === "object" && !Array.isArray(raw.valuesBySku)
      ? Object.fromEntries(Object.entries(raw.valuesBySku as Record<string, unknown>).flatMap(([sku, scoped]) => {
        const scopedValues = displayChoiceValues(scoped);
        return sku.trim() && scopedValues.length > 0 ? [[sku.trim(), scopedValues] as const] : [];
      }))
      : {};

    return [{
      key,
      name,
      required: raw.required !== false,
      values,
      ...(Object.keys(valuesBySku).length > 0 ? { valuesBySku } : {}),
    }];
  });
}

function declaredOptionOrder(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((group) => {
      if (typeof group === "string") return canonicalOptionKey(group);
      if (!group || typeof group !== "object") return null;
      const raw = group as { key?: unknown; name?: unknown };
      const groupKey = typeof raw.key === "string" ? raw.key : typeof raw.name === "string" ? raw.name : "";
      return groupKey ? canonicalOptionKey(groupKey) : null;
    })
    .filter((key): key is string => Boolean(key));
}

function deriveOptionGroups(rows: VariantRow[], declaredGroups: unknown, choices: ReturnType<typeof normalizeChoiceGroups>) {
  const choiceKeys = new Set(choices.map((group) => group.key));
  const valuesByKey = new Map<string, string[]>();

  for (const row of rows) {
    for (const [key, value] of Object.entries(displayOptions(row.options))) {
      if (choiceKeys.has(key) || NON_SELECTABLE_KEYS.has(key)) continue;
      const values = valuesByKey.get(key) || [];
      if (!values.includes(value)) values.push(value);
      valuesByKey.set(key, values);
    }
  }

  const selectable = [...valuesByKey.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([key]) => key);
  const declared = declaredOptionOrder(declaredGroups).filter((key) => selectable.includes(key));
  const ordered = [...new Set([...declared, ...OPTION_ORDER.filter((key) => selectable.includes(key)), ...selectable])];

  return ordered.map((key) => ({
    key,
    name: OPTION_LABELS[key] || key,
    values: valuesByKey.get(key) || [],
  }));
}

function variantCard(row: VariantRow, identity: RequestIdentity) {
  const pricing = evaluateCatalogV2Pricing(identity, row);
  const options = displayOptions(row.options);
  const sizeLabel = options.size || null;
  const packageLabel = options.package || null;
  const sellUnit = options.sell_unit || null;

  return {
    id: row.variant_id,
    variant_id: row.variant_id,
    variantId: row.variant_id,
    product_id: row.product_id,
    productId: row.product_id,
    productKey: row.product_key,
    variantKey: row.variant_key,
    sku: row.sku,
    name: row.variant_name,
    productName: row.product_name,
    brand: row.brand,
    industry: row.industry,
    industryKey: row.industry_key,
    catalogGroupKey: row.catalog_group_key,
    subcategory: row.subcategory,
    options,
    sizeLabel,
    packageLabel,
    sellUnit,
    specificationLabel: [sizeLabel, packageLabel, sellUnit ? `ĐVT: ${sellUnit}` : null].filter(Boolean).join(" · ") || null,
    priceMode: row.price_mode,
    price: pricing.amount,
    priceLabel: pricing.label,
    pricing,
    image: {
      key: row.image_key,
      objectKey: row.image_object_key,
      url: assetUrl(row.image_object_key),
    },
    isActive: row.is_active,
    isPublic: row.is_public,
    isOrderable: pricing.canOrder,
  };
}

function selectVariants(priceGroupParameter: number) {
  return `SELECT
    variant.id::text AS variant_id,
    product.id::text AS product_id,
    product.product_key,
    product.name AS product_name,
    product.brand,
    product.industry,
    product.industry_key,
    product.catalog_group_key,
    product.subcategory,
    product.option_groups,
    product.choice_groups,
    product.cover_image_key,
    product.cover_image_object_key,
    variant.variant_key,
    variant.sku,
    variant.name AS variant_name,
    variant.options,
    variant.price_mode,
    variant.price_label,
    variant.retail_price::text,
    variant.shop_price::text,
    customer_price.price::text AS price_group_price,
    variant.image_key,
    variant.image_object_key,
    variant.status,
    variant.is_orderable,
    variant.is_active,
    variant.is_public,
    variant.sort_order
  FROM catalog_variants variant
  JOIN catalog_products product ON product.id = variant.product_id
  LEFT JOIN LATERAL (
    SELECT price.price
    FROM catalog_variant_prices price
    WHERE price.variant_id = variant.id
      AND price.price_group_id = $${priceGroupParameter}::uuid
      AND price.min_quantity <= 1
    ORDER BY price.min_quantity DESC
    LIMIT 1
  ) customer_price ON true`;
}

async function resolveIdentity(req: Request, res: Response, resolver: IdentityResolver) {
  try {
    return await resolver(req);
  } catch (error) {
    console.error("catalog detail identity resolution failed", error);
    res.status(503).json({ error: "IDENTITY_RESOLUTION_FAILED" });
    return null;
  }
}

export function createCatalogV2DetailRouter(identityResolver: IdentityResolver = async () => anonymousIdentity) {
  const router = Router();

  router.get("/products/:id", async (req, res) => {
    const identity = await resolveIdentity(req, res, identityResolver);
    if (!identity) return;

    const selectedVariantId = req.params.id.trim().toLowerCase();
    if (!UUID_PATTERN.test(selectedVariantId)) {
      res.status(400).json({ error: "INVALID_VARIANT_ID" });
      return;
    }

    const priceGroupId = identity.kind === "customer" ? identity.priceGroupId : null;

    try {
      const selectedResult = await getDb().query<VariantRow>(
        `${selectVariants(1)}
         WHERE variant.id = $2
           AND product.catalog_version = 'hung-phat-v2'
           AND product.status = 'active'
           AND variant.catalog_version = 'hung-phat-v2'
           AND variant.is_active = true
           AND variant.is_public = true
           AND variant.status IN ('active', 'market_price')
         LIMIT 1`,
        [priceGroupId, selectedVariantId],
      );
      const selected = selectedResult.rows[0];

      if (!selected) {
        res.status(404).json({ error: "VARIANT_NOT_FOUND" });
        return;
      }

      const variantsResult = await getDb().query<VariantRow>(
        `${selectVariants(1)}
         WHERE product.id = $2
           AND product.catalog_version = 'hung-phat-v2'
           AND product.status = 'active'
           AND variant.catalog_version = 'hung-phat-v2'
           AND variant.is_active = true
           AND variant.is_public = true
           AND variant.status IN ('active', 'market_price')
         ORDER BY variant.sort_order, variant.sku`,
        [priceGroupId, selected.product_id],
      );

      const choices = normalizeChoiceGroups(selected.choice_groups);
      res.json({
        product: {
          id: selected.product_id,
          productKey: selected.product_key,
          name: selected.product_name,
          brand: selected.brand,
          industry: selected.industry,
          industryKey: selected.industry_key,
          catalogGroupKey: selected.catalog_group_key,
          subcategory: selected.subcategory,
          image: {
            key: selected.cover_image_key || selected.image_key,
            objectKey: selected.cover_image_object_key || selected.image_object_key,
            url: assetUrl(selected.cover_image_object_key || selected.image_object_key),
          },
        },
        optionGroups: deriveOptionGroups(variantsResult.rows, selected.option_groups, choices),
        choiceGroups: choices,
        variants: variantsResult.rows.map((row) => variantCard(row, identity)),
        selectedVariantId,
      });
    } catch (error) {
      console.error("catalog detail failed", error);
      res.status(500).json({ error: "CATALOG_V2_PRODUCT_FAILED" });
    }
  });

  return router;
}
