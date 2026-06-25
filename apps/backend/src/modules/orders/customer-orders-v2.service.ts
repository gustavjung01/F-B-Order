import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import type { CustomerIdentity } from "../auth/auth.identity";

export async function listCustomerOrdersV2(
  identity: CustomerIdentity,
  input: { limit?: number } = {},
  db: Pool = getDb(),
) {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 100);
  const result = await db.query(
    `SELECT
       orders.id::text,
       orders.order_code AS "orderCode",
       orders.status,
       orders.currency,
       orders.subtotal::float8,
       orders.discount_total::float8 AS "discountTotal",
       orders.total_amount::float8 AS "totalAmount",
       orders.customer_note AS "customerNote",
       orders.submitted_at AS "submittedAt",
       orders.confirmed_at AS "confirmedAt",
       orders.cancelled_at AS "cancelledAt",
       orders.created_at AS "createdAt",
       orders.updated_at AS "updatedAt",
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'id', item.id,
             'productId', item.product_id,
             'variantId', item.variant_id,
             'sku', item.sku,
             'name', item.name,
             'unit', item.unit,
             'productType', item.product_type,
             'quantity', item.quantity,
             'unitPrice', item.unit_price,
             'lineTotal', item.line_total,
             'selections', COALESCE(item.selection_snapshot -> 'selections', '{}'::jsonb),
             'selectionKey', COALESCE(item.selection_snapshot ->> 'selectionKey', ''),
             'selectionSnapshot', item.selection_snapshot,
             'snapshotVersion', item.snapshot_version
           ) ORDER BY item.created_at, item.id
         ) FILTER (WHERE item.id IS NOT NULL),
         '[]'::jsonb
       ) AS items
     FROM orders
     LEFT JOIN order_items item ON item.order_id = orders.id
     WHERE orders.customer_id = $1
     GROUP BY orders.id
     ORDER BY orders.created_at DESC, orders.id DESC
     LIMIT $2`,
    [identity.customerId, limit],
  );

  return { orders: result.rows, total: result.rows.length };
}
