import type { PoolClient } from "pg";
import { getDb } from "../../db/pool";
import type { CatalogV2PriceRow } from "./catalog-v2.pricing";

export type CatalogChoiceVariantRow = CatalogV2PriceRow & {
  variant_id: string;
  product_id: string;
  sku: string;
  name: string;
  image_key: string | null;
  image_object_key: string | null;
  choice_groups: unknown;
};

export async function findCatalogChoiceVariant(
  variantId: string,
  priceGroupId: string | null,
  quantity: number,
) {
  const result = await getDb().query<CatalogChoiceVariantRow>(
    `SELECT
       variant.id::text AS variant_id,
       product.id::text AS product_id,
       variant.sku,
       variant.name,
       product.choice_groups,
       variant.price_mode,
       variant.price_label,
       variant.retail_price::text,
       variant.shop_price::text,
       price.price::text AS price_group_price,
       variant.image_key,
       variant.image_object_key,
       variant.status,
       variant.is_orderable,
       variant.is_active,
       variant.is_public
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     LEFT JOIN LATERAL (
       SELECT grouped.price
       FROM catalog_variant_prices grouped
       WHERE grouped.variant_id = variant.id
         AND grouped.price_group_id = $2::uuid
         AND grouped.min_quantity <= $3
       ORDER BY grouped.min_quantity DESC
       LIMIT 1
     ) price ON true
     WHERE variant.id = $1
       AND product.catalog_version = 'hung-phat-v2'
       AND variant.catalog_version = 'hung-phat-v2'
     LIMIT 1`,
    [variantId, priceGroupId, quantity],
  );
  return result.rows[0] || null;
}

export async function ensureActiveCatalogCart(client: PoolClient, customerId: string) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO carts (customer_id, status)
     VALUES ($1, 'active')
     ON CONFLICT (customer_id, status) DO UPDATE SET updated_at = now()
     RETURNING id::text`,
    [customerId],
  );
  return result.rows[0].id;
}

export async function upsertCatalogChoiceCartLine(
  client: PoolClient,
  input: {
    cartId: string;
    variantId: string;
    quantity: number;
    unitPrice: number;
    selections: Record<string, string>;
    selectionKey: string;
  },
) {
  await client.query(
    `INSERT INTO cart_items (
       cart_id, product_id, variant_id, quantity, unit_price, selections, selection_key
     ) VALUES ($1, NULL, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (cart_id, variant_id, selection_key) WHERE variant_id IS NOT NULL
     DO UPDATE SET
       quantity = EXCLUDED.quantity,
       unit_price = EXCLUDED.unit_price,
       selections = EXCLUDED.selections,
       updated_at = now()`,
    [input.cartId, input.variantId, input.quantity, input.unitPrice, JSON.stringify(input.selections), input.selectionKey],
  );
}

export async function removeCatalogChoiceCartLine(
  client: PoolClient,
  input: { customerId: string; variantId: string; selectionKey: string },
) {
  return client.query(
    `DELETE FROM cart_items item
     USING carts cart
     WHERE item.cart_id = cart.id
       AND cart.customer_id = $1
       AND cart.status = 'active'
       AND item.variant_id = $2
       AND item.selection_key = $3`,
    [input.customerId, input.variantId, input.selectionKey],
  );
}
