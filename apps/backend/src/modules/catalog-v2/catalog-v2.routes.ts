import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import { anonymousIdentity, type RequestIdentity } from "../auth/auth.identity";
import { evaluateCatalogV2Pricing, type CatalogV2PriceRow } from "./catalog-v2.pricing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_CATALOG_ASSET_BASE_URL = "https://cdn.bepsi.click";

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
  variant_key: string;
  sku: string;
  variant_name: string;
  options: unknown;
  image_key: string | null;
  image_object_key: string | null;
  sort_order: number;
};

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 300;
  return Math.min(Math.max(parsed, 1), 500);
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

function displayOptionValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/-/g, " ").trim().toLowerCase();
  return OPTION_VALUE_LABELS[normalized] || value;
}

function displayOptions(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, optionValue]) => [
      key,
      displayOptionValue(optionValue),
    ]),
  );
}

function optionText(options: Record<string, unknown>, key: string): string | null {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayOptionGroups(value: unknown): Array<{ name: string; values: unknown[] }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group): group is { name: string; values: unknown[] } => (
      Boolean(group) &&
      typeof group === "object" &&
      typeof (group as { name?: unknown }).name === "string" &&
      Array.isArray((group as { values?: unknown }).values)
    ))
    .map((group) => ({
      name: group.name,
      values: group.values.map(displayOptionValue),
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

export function createCatalogV2Router(
  identityResolver: IdentityResolver = async () => anonymousIdentity,
) {
  const router = Router();

  router.get("/products", async (req, res) => {
    const identity = await resolveIdentity(req, res, identityResolver);
    if (!identity) return;

    const q = readText(req.query.q);
    const industry = readText(req.query.industry);
    const subcategory = readText(req.query.subcategory);
    const limit = readLimit(req.query.limit);
    const priceGroupId = identity.kind === "customer" ? identity.priceGroupId : null;
    const values: unknown[] = [priceGroupId];
    const clauses = [
      "product.catalog_version = 'hung-phat-v2'",
      "product.status = 'active'",
      "variant.catalog_version = 'hung-phat-v2'",
      "variant.is_active = true",
      "variant.is_public = true",
      "variant.status IN ('active', 'market_price')",
    ];

    if (industry && industry !== "all") {
      values.push(industry);
      clauses.push(`product.industry_key = $${values.length}`);
    }
    if (subcategory && subcategory !== "all") {
      values.push(subcategory);
      clauses.push(`product.subcategory = $${values.length}`);
    }
    if (q) {
      values.push(`%${q}%`);
      clauses.push(`(
        variant.name ILIKE $${values.length}
        OR variant.sku ILIKE $${values.length}
        OR product.name ILIKE $${values.length}
        OR COALESCE(product.brand, '') ILIKE $${values.length}
      )`);
    }

    values.push(limit);

    try {
      const result = await getDb().query<VariantRow>(
        `${variantSelect(1)}
         WHERE ${clauses.join(" AND ")}
         ORDER BY product.sort_order, variant.sort_order, variant.sku
         LIMIT $${values.length}`,
        values,
      );

      res.json({
        products: result.rows.map((row) => toVariantCard(row, identity)),
        total: result.rows.length,
        cardModel: "variant",
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
            key: selected.cover_image_key,
            objectKey: selected.cover_image_object_key,
            url: assetUrl(selected.cover_image_object_key),
          },
        },
        optionGroups: displayOptionGroups(selected.option_groups),
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
