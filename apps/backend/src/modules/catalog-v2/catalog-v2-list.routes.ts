import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import { anonymousIdentity, type RequestIdentity } from "../auth/auth.identity";
import { evaluateCatalogV2Pricing, type CatalogV2PriceRow } from "./catalog-v2.pricing";

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 10000;
const MAX_FILTER_VALUES = 50;
const ASSET_BASE_URL = "https://cdn.bepsi.click";

const GROUP_LABELS: Record<string, string> = {
  tra: "Trà", siro: "Siro", "sinh-to": "Sinh tố", sot: "Sốt",
  "tran-chau": "Trân châu", "3q": "3Q", "thach-rau-cau": "Thạch & rau câu",
  "flan-pudding": "Flan & pudding", "bot-sua-kem-beo": "Bột sữa & kem béo",
  "bot-tao-vi": "Bột tạo vị", "sua-kem": "Sữa & kem",
  "milk-foam-kem-cheese": "Milk foam & kem cheese",
  "duong-chat-tao-ngot": "Đường & chất tạo ngọt", "trai-cay-hop": "Trái cây hộp",
  "topping-khac": "Topping khác", "khac-da-duyet": "Khác",
};

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;
type Filters = { q: string | null; industries: string[]; groups: string[] };
type VariantRow = CatalogV2PriceRow & {
  variant_id: string; product_id: string; product_key: string; product_name: string;
  brand: string | null; industry: string; industry_key: string; catalog_group_key: string | null;
  subcategory: string | null; cover_image_key: string | null; cover_image_object_key: string | null;
  product_sort_order: number; variant_key: string; sku: string; variant_name: string;
  options: Record<string, string>; image_key: string | null; image_object_key: string | null;
  sort_order: number; parent_variant_count: number; parent_min_price: string | null; parent_max_price: string | null;
};
type FacetRow = { id: string; name?: string; product_count: number };

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTextList(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap((entry) => (
    typeof entry === "string" ? entry.split(",") : []
  )).map((entry) => entry.trim()).filter(Boolean))].slice(0, MAX_FILTER_VALUES);
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function assetUrl(objectKey: string | null) {
  if (!objectKey) return null;
  const base = (process.env.R2_PUBLIC_BASE_URL || process.env.CATALOG_ASSET_BASE_URL || ASSET_BASE_URL).trim();
  return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function filterQuery(filters: Filters, initialValues: unknown[] = [], omit: Set<keyof Filters> = new Set()) {
  const values = [...initialValues];
  const clauses = [
    "product.catalog_version='hung-phat-v2'", "product.status='active'",
    "variant.catalog_version='hung-phat-v2'", "variant.is_active=true", "variant.is_public=true",
    "variant.status IN ('active','market_price')",
  ];
  if (!omit.has("industries") && filters.industries.length > 0) {
    values.push(filters.industries);
    clauses.push(`product.industry_key=ANY($${values.length}::text[])`);
  }
  if (!omit.has("groups") && filters.groups.length > 0) {
    values.push(filters.groups);
    clauses.push(`product.catalog_group_key=ANY($${values.length}::text[])`);
  }
  if (!omit.has("q") && filters.q) {
    values.push(`%${filters.q}%`);
    clauses.push(`(product.name ILIKE $${values.length} OR variant.name ILIKE $${values.length} OR variant.sku ILIKE $${values.length} OR COALESCE(product.brand,'') ILIKE $${values.length})`);
  }
  return { values, clauses };
}

function variantSelect(priceGroupParameter: number) {
  return `SELECT variant.id::text AS variant_id, product.id::text AS product_id,
    product.product_key, product.name AS product_name, product.brand, product.industry,
    product.industry_key, product.catalog_group_key, product.subcategory,
    product.cover_image_key, product.cover_image_object_key, product.sort_order AS product_sort_order,
    variant.variant_key, variant.sku, variant.name AS variant_name, variant.options,
    variant.price_mode, variant.price_label, variant.retail_price::text, variant.shop_price::text,
    customer_price.price::text AS price_group_price, variant.image_key, variant.image_object_key,
    variant.status, variant.is_orderable, variant.is_active, variant.is_public, variant.sort_order
  FROM catalog_variants variant
  JOIN catalog_products product ON product.id=variant.product_id
  LEFT JOIN LATERAL (
    SELECT price.price FROM catalog_variant_prices price
    WHERE price.variant_id=variant.id AND price.price_group_id=$${priceGroupParameter}::uuid
      AND price.min_quantity<=1 ORDER BY price.min_quantity DESC LIMIT 1
  ) customer_price ON true`;
}

function toCard(row: VariantRow, identity: RequestIdentity) {
  const pricing = evaluateCatalogV2Pricing(identity, row);
  const options = row.options || {};
  const sizeLabel = typeof options.size === "string" ? options.size : null;
  const packageLabel = typeof options.package === "string" ? options.package : null;
  const sellUnit = typeof options.sell_unit === "string" ? options.sell_unit : null;
  return {
    id: row.variant_id, variant_id: row.variant_id, variantId: row.variant_id,
    product_id: row.product_id, productId: row.product_id, productKey: row.product_key,
    variantKey: row.variant_key, sku: row.sku, name: row.product_name, productName: row.product_name,
    brand: row.brand, industry: row.industry, industryKey: row.industry_key,
    catalogGroupKey: row.catalog_group_key, subcategory: row.subcategory, options,
    sizeLabel, packageLabel, sellUnit,
    specificationLabel: [sizeLabel, packageLabel, sellUnit ? `ĐVT: ${sellUnit}` : null].filter(Boolean).join(" · ") || null,
    priceMode: row.price_mode, price: pricing.amount, priceLabel: pricing.label, pricing,
    priceMin: money(row.parent_min_price), priceMax: money(row.parent_max_price),
    variantCount: Math.max(Number(row.parent_variant_count) || 1, 1),
    image: {
      key: row.cover_image_key || row.image_key,
      objectKey: row.cover_image_object_key || row.image_object_key,
      url: assetUrl(row.cover_image_object_key || row.image_object_key),
    },
    isActive: row.is_active, isPublic: row.is_public, isOrderable: pricing.canOrder,
  };
}

async function identity(req: Request, res: Response, resolver: IdentityResolver) {
  try { return await resolver(req); }
  catch (error) {
    console.error("catalog list identity failed", error);
    res.status(503).json({ error: "IDENTITY_RESOLUTION_FAILED" });
    return null;
  }
}

export function createCatalogV2ListRouter(identityResolver: IdentityResolver = async () => anonymousIdentity) {
  const router = Router();
  router.get("/products", async (req, res) => {
    const requestIdentity = await identity(req, res, identityResolver);
    if (!requestIdentity) return;
    const filters: Filters = {
      q: readText(req.query.q),
      industries: readTextList(req.query.industry),
      groups: readTextList(req.query.group),
    };
    const limit = integer(req.query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const offset = integer(req.query.offset, 0, 0, MAX_OFFSET);
    const priceGroupId = requestIdentity.kind === "customer" ? requestIdentity.priceGroupId : null;
    const listFilter = filterQuery(filters, [priceGroupId]);
    const countFilter = filterQuery(filters);
    const industryFilter = filterQuery(filters, [], new Set(["industries"]));
    const groupFilter = filterQuery(filters, [], new Set(["groups"]));
    listFilter.values.push(limit, offset);
    const limitParameter = listFilter.values.length - 1;
    const offsetParameter = listFilter.values.length;
    try {
      const [productsResult, totalResult, industriesResult, groupsResult] = await Promise.all([
        getDb().query<VariantRow>(`SELECT * FROM (
          SELECT base.*,
            ROW_NUMBER() OVER (PARTITION BY base.product_id ORDER BY base.sort_order, base.sku) AS product_rank,
            (SELECT COUNT(*) FROM catalog_variants sibling WHERE sibling.product_id=base.product_id::uuid AND sibling.is_active AND sibling.is_public AND sibling.status IN ('active','market_price'))::int AS parent_variant_count,
            (SELECT MIN(sibling.shop_price)::text FROM catalog_variants sibling WHERE sibling.product_id=base.product_id::uuid AND sibling.is_active AND sibling.is_public AND sibling.status IN ('active','market_price') AND sibling.price_mode='fixed') AS parent_min_price,
            (SELECT MAX(sibling.shop_price)::text FROM catalog_variants sibling WHERE sibling.product_id=base.product_id::uuid AND sibling.is_active AND sibling.is_public AND sibling.status IN ('active','market_price') AND sibling.price_mode='fixed') AS parent_max_price
          FROM (${variantSelect(1)} WHERE ${listFilter.clauses.join(" AND ")}) base
        ) ranked WHERE product_rank=1 ORDER BY product_sort_order, sort_order, sku
        LIMIT $${limitParameter} OFFSET $${offsetParameter}`, listFilter.values),
        getDb().query<{ total: number }>(`SELECT COUNT(DISTINCT product.id)::int AS total FROM catalog_variants variant JOIN catalog_products product ON product.id=variant.product_id WHERE ${countFilter.clauses.join(" AND ")}`, countFilter.values),
        getDb().query<FacetRow>(`SELECT product.industry_key AS id, product.industry AS name, COUNT(DISTINCT product.id)::int AS product_count FROM catalog_variants variant JOIN catalog_products product ON product.id=variant.product_id WHERE ${industryFilter.clauses.join(" AND ")} GROUP BY product.industry_key, product.industry ORDER BY product.industry`, industryFilter.values),
        getDb().query<FacetRow>(`SELECT product.catalog_group_key AS id, COUNT(DISTINCT product.id)::int AS product_count FROM catalog_variants variant JOIN catalog_products product ON product.id=variant.product_id WHERE ${groupFilter.clauses.join(" AND ")} AND product.industry_key='nguyen-lieu-tra-sua' AND product.catalog_group_key IS NOT NULL GROUP BY product.catalog_group_key ORDER BY MIN(product.sort_order)`, groupFilter.values),
      ]);
      const products = productsResult.rows.map((row) => toCard(row, requestIdentity));
      const total = Number(totalResult.rows[0]?.total) || 0;
      res.json({
        products, total, cardModel: "parent",
        pagination: { limit, offset, hasMore: offset + products.length < total },
        facets: {
          industries: industriesResult.rows.map((row) => ({ id: row.id, name: row.name || row.id, productCount: Number(row.product_count) || 0 })),
          groups: groupsResult.rows.map((row) => ({ id: row.id, name: GROUP_LABELS[row.id] || row.id, productCount: Number(row.product_count) || 0 })),
          brands: [],
        },
      });
    } catch (error) {
      console.error("catalog grouped list failed", error);
      res.status(500).json({ error: "CATALOG_V2_PRODUCTS_FAILED" });
    }
  });
  return router;
}
