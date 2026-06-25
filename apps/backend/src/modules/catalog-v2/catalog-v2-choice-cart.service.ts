import type { PoolClient } from "pg";

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
    [
      input.cartId,
      input.variantId,
      input.quantity,
      input.unitPrice,
      JSON.stringify(input.selections),
      input.selectionKey,
    ],
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
