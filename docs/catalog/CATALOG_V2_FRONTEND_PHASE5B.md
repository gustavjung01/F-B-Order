# Phase 5B — Frontend catalog v2

## List

The customer catalog calls:

```http
GET /api/catalog-v2/products?limit=500
```

This proxies backend `GET /catalog/products` and renders 275 variant cards. Each card identity is `variant_id`, not the parent product ID.

## Detail and option selection

Opening a card calls:

```http
GET /api/catalog-v2/products/:variant_id
```

The response contains:

```json
{
  "product": {},
  "optionGroups": [],
  "variants": [],
  "selectedVariantId": "uuid"
}
```

Selecting a value such as flavor, size or color switches to a real member of `variants`. The UI then updates together:

- `variant_id`
- `sku`
- `price` / `priceLabel`
- `image`

The frontend never reconstructs an SKU from option text.

## Cart

Adding a line calls:

```http
POST /api/cart-v2/items
Content-Type: application/json

{
  "variant_id": "uuid",
  "quantity": 1
}
```

Local storage key `bep_si_fb_cart_variant_items_v3` stores only:

```json
[
  {
    "variant_id": "uuid",
    "quantity": 1
  }
]
```

Quantity updates use the same POST endpoint. Removing a line calls:

```http
DELETE /api/cart-v2/items/:variant_id
```

Market-price and unavailable-price variants remain visible but cannot be added to cart.

## Cutover safety

Legacy backend `/api/catalog` remains mounted during the controlled cutover. The new customer UI uses `/api/catalog-v2` and `/api/cart-v2`; it does not send variant UUIDs to the old order API. Checkout stays disabled until the order engine accepts `variant_id` end to end.
