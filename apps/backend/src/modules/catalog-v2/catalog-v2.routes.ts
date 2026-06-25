import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import { anonymousIdentity, type RequestIdentity } from "../auth/auth.identity";
import { evaluateCatalogV2Pricing, type CatalogV2PriceRow } from "./catalog-v2.pricing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CATALOG_ASSET_BASE_URL = "https://cdn.bepsi.click";
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 10000;

const OPTION_VALUE_LABELS: Record<string, string> = {
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

const OPTION_GROUP_LABELS: Record<string, string> = {
  flavor: "Vị",
  flavor_or_type: "Vị / loại",
  type: "Loại",
  color: "Màu",
  size: "Dung tích / khối lượng",
};

const OPTION_GROUP_ORDER = ["size", "flavor", "flavor_or_type", "type", "color"];
const NON_SELECTABLE_OPTION_KEYS = new Set(["package", "sell_unit"]);

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

type VariantRow = CatalogV2PriceRow & {
  variant_id: string;
  product_id: string;
  product_key: string;
  product_name: string;
  brand: string | null;
  industry: string;
  industry_key: string;
  subcategory: string | null;
  option_groups: unknown;
  cover_image_key: string | null;
  cover_image_object_key: string | null;
  product_sort_order: number;
  variant_key: string;
  sku: string;
  variant_name: string;
  options: unknown;
  image_key: string | null;
  image_object_key: string | null;
  sort_order: number;
  parent_variant_count?: number;
  parent_min_price?: string | null;
  parent_max_price?: string | null;
};

type FacetRow = {
  id: string;
  name: string;
  product_count: number;
};

type CatalogFilters = {
  q: string | null;
  industry: string | null;
  brands: string[];
  subcategory: string | null;
};

type FilterKey = keyof CatalogFilters;

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTextList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.flatMap((item) => (
    typeof item === "string" ? item.split(",") : []
  )).map((item) => item.trim()).filter(Boolean);
  return [...new Set(normalized)].slice(0, 50);
}

function readBoundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function readLimit(value: unknown): number {
  return readBoundedInteger(value, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
}

function readOffset(value: unknown): number {
  return readBoundedInteger(value, 0, 0, MAX_OFFSET);
}

function readPrice(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function assetUrl(objectKey: string | null): string | null {
  if (!objectKey) return null;
  const base = (
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.CATALOG_ASSET_BASE_URL ||
    DEFAULT_CATALOG_ASSET_BASE_URL
  ).trim();
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
    flavor: "flavor",
    flavour: "flavor",
    vi_loai: "flavor_or_type",
    flavor_or_type: "flavor_or_type",
    loai: "type",
    type: "type",
    mau: "color",
    color: "color",
    size: "size",
    dung_tich: "size",
    khoi_luong: "size",
    trong_luong: "size",
    volume: "size",
    weight: "size",
    capacity: "size",
    package: "package",
    quy_cach: "package",
    quy_cach_dong_goi: "package",
    sell_unit: "sell_unit",
    don_vi_ban: "sell_unit",
    dvt: "sell_unit",
  };
  return aliases[key] || key;
}

function displayOptionValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/-/g, " ").trim().toLowerCase();
  return OPTION_VALUE_LABELS[normalized] || value.trim();
}

function displayOptions(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = canonicalOptionKey(rawKey);
    const nextValue = displayOptionValue(rawValue);
    const currentValue = result[key];
    const shouldReplace = currentValue === undefined || currentValue === null || currentValue === "Khác";
    if (shouldReplace) result[key] = nextValue;
  }
  return result;
}

function optionText(options: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = options[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function declaredOptionOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((group) => {
      if (!group || typeof group !== "object") return null;
      const name = (group as { name?: unknown }).name;
      return typeof name === "string" ? canonicalOptionKey(name) : null;
    })
    .filter((key): key is string => Boolean(key));
}

function deriveOptionGroups(rows: VariantRow[], declaredGroups: unknown) {
  const valuesByKey = new Map<string, string[]>();
  for (const row of rows) {
    const options = displayOptions(row.options);
    for (const [key, value] of Object.entries(options)) {
      if (NON_SELECTABLE_OPTION_KEYS.has(key) || typeof value !== "string" || !value.trim()) continue;
      const values = valuesByKey.get(key) || [];
      if (!values.includes(value)) values.push(value);
      valuesByKey.set(key, values);
    }
  }

  const selectableKeys = [...valuesByKey.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([key]) => key);
  const declared = declaredOptionOrder(declaredGroups).filter((key) => selectableKeys.includes(key));
  const ordered = [...new Set([
    ...declared,
    ...OPTION_GROUP_ORDER.filter((key) => selectableKeys.includes(key)),
    ...selectableKeys.sort((left, right) => left.localeCompare(right, "vi")),
  ])];

  return ordered.map((key) => ({
    key,
    name: OPTION_GROUP_LABELS[key] || key,
    values: valuesByKey.get(key) || [],
  }));
}

function toVariantCard(row: VariantRow, identity: RequestIdentity) {
  const pricing = evaluateCatalogV2Pricing(identity, row);
  const options = displayOptions(row.options);
  const sizeLabel = optionText(options, "size");
  const packageLabel = optionText(options, "package");
  const sellUnit = optionText(options, "sell_unit");
  const specificationLabel = [sizeLabel, packageLabel, sellUnit ? `ĐVT: ${sellUnit}` : null]
    .filter((value): value is string => Boolean(value))
    .join(" · ") || null;

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
    subcategory: row.subcategory,
    options,
    sizeLabel,
    packageLabel,
    sellUnit,
    specificationLabel,
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

function toParentCard(row: VariantRow, identity: RequestIdentity) {
  const representative = toVariantCard(row, identity);
  return {
    ...representative,
    name: row.product_name,
    variantCount: Math.max(Number(row.parent_variant_count) || 1, 1),
    priceMin: readPrice(row.parent_min_price),
    priceMax: readPrice(row.parent_max_price),
    image: {
      key: row.cover_image_key || row.image_key,
      objectKey: row.cover_image_object_key || row.image_object_key,
      url: assetUrl(row.cover_image_object_key || row.image_object_key),
    },
  };
}

async function resolveIdentity(
  req: Request,
  res: Response,
  resolver: IdentityResolver,
): Promise<RequestIdentity | null> {
  try {
    return await resolver(req);
  } catch (error) {
    console.error("catalog v2 identity resolution failed", error);
    res.status(503).json({ error: "IDENTITY_RESOLUTION_FAILED" });
    return null;
  }
}

function variantSelect(priceGroupParameter: number) {
  return `
    SELECT
      variant.id::text AS variant_id,
      product.id::text AS product_id,
      product.product_key,
      product.name AS product_name,
      product.brand,
      product.industry,
      product.industry_key,
      product.subcategory,
      product.option_groups,
      product.cover_image_key,
      product.cover_image_object_key,
      product.sort_order AS product_sort_order,
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
    ) customer_price ON true
  `;
}

function buildFilterQuery(
  filters: CatalogFilters,
  initialValues: unknown[] = [],
  omitted: ReadonlySet<FilterKey> = new Set(),
) {
  const values = [...initialValues];
  const clauses = [
    "product.catalog_version = 'hung-phat-v2'",
    "product.status = 'active'",
    "variant.catalog_version = 'hung-phat-v2'",
    "variant.is_active = true",
    "variant.is_public = true",
    "variant.status IN ('active', 'market_price')",
  ];

  if (!omitted.has("industry") && filters.industry && filters.industry !== "all") {
    values.push(filters.industry);
    clauses.push(`product.industry_key = $${values.length}`);
  }
  if (!omitted.has("brands") && filters.brands.length > 0) {
    values.push(filters.brands);
    clauses.push(`product.brand = ANY($${values.length}::text[])`);
  }
  if (!omitted.has("subcategory") && filters.subcategory && filters.subcategory !== "all") {
    values.push(filters.subcategory);
    clauses.push(`product.subcategory = $${values.length}`);
  }
  if (!omitted.has("q") && filters.q) {
    values.push(`%${filters.q}%`);
    clauses.push(`(
      variant.name ILIKE $${values.length}
      OR variant.sku ILIKE $${values.length}
      OR product.name ILIKE $${values.length}
      OR COALESCE(product.brand, '') ILIKE $${values.length}
    )`);
  }

  return { clauses, values };
}

function toFacet(row: FacetRow) {
  return {
    id: row.id,
    name: row.name,
    productCount: Number(row.product_count) || 0,
  };
}

export function createCatalogV2Router(
  identityResolver: IdentityResolver = async () => anonymousIdentity,
) {
  const router = Router();

  router.get("/products", async (req, res) => {
    const identity = await resolveIdentity(req, res, identityResolver);
    if (!identity) return;

    const filters: CatalogFilters = {
      q: readText(req.query.q),
      industry: readText(req.query.industry),
      brands: readTextList(req.query.brand),
      subcategory: readText(req.query.subcategory),
    };
    const limit = readLimit(req.query.limit);
    const offset = readOffset(req.query.offset);
    const priceGroupId = identity.kind === "customer" ? identity.priceGroupId : null;
    const listFilter = buildFilterQuery(filters, [priceGroupId]);
    const countFilter = buildFilterQuery(filters);
    const industryFacetFilter = buildFilterQuery(filters, [], new Set<FilterKey>(["industry"]));
    const brandFacetFilter = buildFilterQuery(filters, [], new Set<FilterKey>(["brands"]));

    listFilter.values.push(limit, offset);
    const limitParameter = listFilter.values.length - 1;
    const offsetParameter = listFilter.values.length;

    try {
      const [productsResult, totalResult, industriesResult, brandsResult] = await Promise.all([
        getDb().query<VariantRow>(
          `SELECT *
           FROM (
             SELECT base.*,
               ROW_NUMBER() OVER (
                 PARTITION BY base.product_id
                 ORDER BY base.sort_order, base.sku
               ) AS product_rank,
               (SELECT COUNT(*)
                FROM catalog_variants sibling
                WHERE sibling.product_id = base.product_id::uuid
                  AND sibling.catalog_version = 'hung-phat-v2'
                  AND sibling.is_active = true
                  AND sibling.is_public = true
                  AND sibling.status IN ('active', 'market_price'))::int AS parent_variant_count,
               (SELECT MIN(sibling.shop_price)::text
                FROM catalog_variants sibling
                WHERE sibling.product_id = base.product_id::uuid
                  AND sibling.catalog_version = 'hung-phat-v2'
                  AND sibling.is_active = true
                  AND sibling.is_public = true
                  AND sibling.status IN ('active', 'market_price')
                  AND sibling.price_mode = 'fixed'
                  AND sibling.shop_price IS NOT NULL) AS parent_min_price,
               (SELECT MAX(sibling.shop_price)::text
                FROM catalog_variants sibling
                WHERE sibling.product_id = base.product_id::uuid
                  AND sibling.catalog_version = 'hung-phat-v2'
                  AND sibling.is_active = true
                  AND sibling.is_public = true
                  AND sibling.status IN ('active', 'market_price')
                  AND sibling.price_mode = 'fixed'
                  AND sibling.shop_price IS NOT NULL) AS parent_max_price
             FROM (
               ${variantSelect(1)}
               WHERE ${listFilter.clauses.join(" AND ")}
             ) base
           ) ranked
           WHERE product_rank = 1
           ORDER BY product_sort_order, sort_order, sku
           LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
          listFilter.values,
        ),
        getDb().query<{ total: number }>(
          `SELECT COUNT(DISTINCT product.id)::int AS total
           FROM catalog_variants variant
           JOIN catalog_products product ON product.id = variant.product_id
           WHERE ${countFilter.clauses.join(" AND ")}`,
          countFilter.values,
        ),
        getDb().query<FacetRow>(
          `SELECT
             product.industry_key AS id,
             product.industry AS name,
             COUNT(DISTINCT product.id)::int AS product_count
           FROM catalog_variants variant
           JOIN catalog_products product ON product.id = variant.product_id
           WHERE ${industryFacetFilter.clauses.join(" AND ")}
           GROUP BY product.industry_key, product.industry
           ORDER BY product.industry`,
          industryFacetFilter.values,
        ),
        getDb().query<FacetRow>(
          `SELECT
             product.brand AS id,
             product.brand AS name,
             COUNT(DISTINCT product.id)::int AS product_count
           FROM catalog_variants variant
           JOIN catalog_products product ON product.id = variant.product_id
           WHERE ${brandFacetFilter.clauses.join(" AND ")}
             AND product.brand IS NOT NULL
             AND BTRIM(product.brand) <> ''
           GROUP BY product.brand
           ORDER BY product.brand`,
          brandFacetFilter.values,
        ),
      ]);

      const total = Number(totalResult.rows[0]?.total) || 0;
      const products = productsResult.rows.map((row) => toParentCard(row, identity));

      res.json({
        products,
        total,
        cardModel: "parent",
        pagination: {
          limit,
          offset,
          hasMore: offset + products.length < total,
        },
        facets: {
          industries: industriesResult.rows.map(toFacet),
          brands: brandsResult.rows.map(toFacet),
        },
      });
    } catch (error) {
      console.error("catalog v2 products failed", error);
      res.status(500).json({ error: "CATALOG_V2_PRODUCTS_FAILED" });
    }
  });

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
        `${variantSelect(1)}
         WHERE variant.id = $2
           AND product.catalog_version = 'hung-phat-v2'
           AND variant.catalog_version = 'hung-phat-v2'
         LIMIT 1`,
        [priceGroupId, selectedVariantId],
      );
      const selected = selectedResult.rows[0];
      if (!selected) {
        res.status(404).json({ error: "VARIANT_NOT_FOUND" });
        return;
      }

      const variantsResult = await getDb().query<VariantRow>(
        `${variantSelect(1)}
         WHERE product.id = $2
           AND variant.is_active = true
           AND variant.is_public = true
           AND variant.status IN ('active', 'market_price')
         ORDER BY variant.sort_order, variant.sku`,
        [priceGroupId, selected.product_id],
      );

      res.json({
        product: {
          id: selected.product_id,
          productKey: selected.product_key,
          name: selected.product_name,
          brand: selected.brand,
          industry: selected.industry,
          industryKey: selected.industry_key,
          subcategory: selected.subcategory,
          image: {
            key: selected.cover_image_key || selected.image_key,
            objectKey: selected.cover_image_object_key || selected.image_object_key,
            url: assetUrl(selected.cover_image_object_key || selected.image_object_key),
          },
        },
        optionGroups: deriveOptionGroups(variantsResult.rows, selected.option_groups),
        variants: variantsResult.rows.map((row) => toVariantCard(row, identity)),
        selectedVariantId,
      });
    } catch (error) {
      console.error("catalog v2 detail failed", error);
      res.status(500).json({ error: "CATALOG_V2_PRODUCT_FAILED" });
    }
  });

  return router;
}
