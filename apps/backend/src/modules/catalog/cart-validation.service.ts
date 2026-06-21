import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type { CustomerIdentity } from "../auth/auth.identity";
import { normalizeOrderItems, type CreateOrderItemInput } from "../orders/orders.service";
import { toCatalogProduct, type CatalogProductRow } from "./catalog-contract";

type CartProductRow = CatalogProductRow & {
  requested_quantity: string;
};

export async function validateCart(
  identity: CustomerIdentity,
  rawItems: unknown,
  db: Pool = getDb(),
) {
  const items = normalizeOrderItems(rawItems);
  const productIds = items.map((item) => item.productId);
  const quantities = items.map((item) => item.quantity);

  const result = await db.query<CartProductRow>(
    `WITH requested(product_id, quantity) AS (
       SELECT * FROM unnest($1::uuid[], $2::numeric[])
     )
     SELECT
       product.id::text,
       product.slug,
       product.sku,
       product.name,
       product.brand,
       category.slug AS category_id,
       category.name AS category_name,
       subcategory.slug AS subcategory_id,
       subcategory.name AS subcategory_name,
       product.product_type,
       product.catalog_kind,
       COALESCE(product.package_size_label, product.package_size, product.package_spec) AS package_size_label,
       COALESCE(product.unit_label, product.unit) AS unit_label,
       product.base_price,
       product.wholesale_price,
       customer_price.price AS price_group_price,
       product.min_order_qty,
       product.image_url,
       product.short_description,
       product.use_cases,
       product.selling_points,
       product.data_issues,
       (product.is_orderable AND product.status IN ('active', 'needs_review')) AS ordering_enabled,
       product.is_active,
       product.is_public,
       requested.quantity::text AS requested_quantity,
       COALESCE(bundle_stats.bundle_item_count, 0)::text AS bundle_item_count,
       COALESCE(bundle_stats.invalid_bundle_item_count, 0)::text AS invalid_bundle_item_count
     FROM requested
     JOIN products product ON product.id = requested.product_id
     JOIN categories category ON category.id = product.category_id
     LEFT JOIN categories subcategory ON subcategory.id = product.subcategory_id
     LEFT JOIN LATERAL (
       SELECT product_price.price
       FROM product_prices product_price
       WHERE product_price.product_id = product.id
         AND product_price.price_group_id = $3::uuid
         AND product_price.min_quantity <= requested.quantity
       ORDER BY product_price.min_quantity DESC
       LIMIT 1
     ) customer_price ON true
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS bundle_item_count,
         COUNT(*) FILTER (
           WHERE component.id IS NULL
              OR component.is_public IS DISTINCT FROM true
              OR component.is_active IS DISTINCT FROM true
              OR COALESCE(component.status, '') NOT IN ('active', 'needs_review')
              OR component.is_orderable IS DISTINCT FROM true
              OR NULLIF(BTRIM(component.sku), '') IS NULL
              OR NULLIF(BTRIM(COALESCE(component.unit_label, component.unit)), '') IS NULL
              OR NOT (
                COALESCE(component.wholesale_price, 0) > 0
                OR COALESCE(component.base_price, 0) > 0
                OR EXISTS (
                  SELECT 1
                  FROM product_prices component_price
                  WHERE component_price.product_id = component.id
                    AND component_price.price > 0
                )
              )
         ) AS invalid_bundle_item_count
       FROM product_bundle_items bundle_item
       LEFT JOIN products component ON component.id = bundle_item.component_product_id
       WHERE bundle_item.bundle_product_id = product.id
     ) bundle_stats ON true`,
    [productIds, quantities, identity.priceGroupId],
  );

  const rowById = new Map(result.rows.map((row) => [row.id, row]));
  const validatedItems = items.map((item: CreateOrderItemInput) => {
    const row = rowById.get(item.productId);
    if (!row) {
      return {
        productId: item.productId,
        quantity: item.quantity,
        product: null,
        quantityValid: false,
        canOrder: false,
        lineTotal: null,
        errors: ["PRODUCT_NOT_FOUND"],
      };
    }

    const product = toCatalogProduct(row, identity);
    const quantityValid = item.quantity >= product.minOrderQty;
    const visibleAmount = product.pricing.visibility === "visible" ? product.pricing.amount : null;
    const errors: string[] = [];
    if (!quantityValid) errors.push("MINIMUM_ORDER_QUANTITY_NOT_MET");
    if (!product.isOrderable) errors.push("PRODUCT_NOT_ORDERABLE");

    return {
      productId: item.productId,
      quantity: item.quantity,
      product,
      quantityValid,
      canOrder: product.isOrderable && quantityValid,
      lineTotal: visibleAmount === null ? null : Math.round(visibleAmount * item.quantity * 100) / 100,
      errors,
    };
  });

  const canCheckout = validatedItems.length > 0 && validatedItems.every((item) => item.canOrder);
  const totalPreview = validatedItems.every((item) => item.lineTotal !== null)
    ? validatedItems.reduce((total, item) => total + Number(item.lineTotal), 0)
    : null;

  return {
    items: validatedItems,
    canCheckout,
    totalPreview,
    currency: "VND" as const,
    approvalStatus: identity.approvalStatus,
    accountStatus: identity.accountStatus,
  };
}
