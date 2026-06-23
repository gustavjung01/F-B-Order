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
- `sizeLabel`
- `packageLabel`
- `sellUnit`
- `specificationLabel`

The frontend never reconstructs an SKU from option text.

## Specifications

The supplement file `data/catalog/hung-phat/v2/product-variants.csv` is joined by SKU during import.

The API exposes the available commercial specification fields:

- `sizeLabel`: volume, weight or physical size when the source contains it.
- `packageLabel`: carton/package configuration.
- `sellUnit`: selling unit.
- `specificationLabel`: combined display string.

Missing net weight or volume is displayed as unavailable source data. It must not be inferred from the image or product name.

## Pricing

For fixed-price variants, the catalog source `price` is treated as the dealer price.

When no explicit retail price is configured:

```text
estimated retail price = dealer price × 1.15
```

The API marks this with:

```json
{
  "pricing": {
    "estimated": true,
    "estimateMarkupPercent": 15
  }
}
```

The customer UI labels the value `Giá lẻ dự kiến` and explains that it is calculated from dealer price plus 15%. Market-price variants remain `Thời giá` and are not estimated.

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
