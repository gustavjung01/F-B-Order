# Catalog v2 backend contract

## Data model

- `catalog_products`: 188 parent products used to group option selections.
- `catalog_variants`: 275 sellable cards/SKUs.
- The public list is variant-based and therefore returns 275 cards.
- Product detail groups all sibling variants under one parent product.
- Cart and order payloads use `variantId`; option text is display metadata only.

## GET /catalog/products

Returns variant cards:

```json
{
  "products": [
    {
      "id": "variant-uuid",
      "variantId": "variant-uuid",
      "productId": "parent-uuid",
      "productKey": "sinh-to-berrino",
      "variantKey": "sinh-to-berrino-dau",
      "sku": "BGKQ-0015",
      "name": "Sinh tố Berrino Dâu",
      "options": { "Vị": "Dâu" },
      "priceMode": "fixed",
      "pricing": {
        "visibility": "visible",
        "amount": 89000,
        "currency": "VND",
        "source": "shop"
      },
      "image": {
        "key": "bgkq-0015",
        "objectKey": "catalog/hung-phat/v2/products/bgkq-0015.webp",
        "url": "https://.../catalog/hung-phat/v2/products/bgkq-0015.webp"
      }
    }
  ],
  "total": 275,
  "cardModel": "variant"
}
```

## GET /catalog/products/:id

`:id` is the selected `variantId`.

```json
{
  "product": {
    "id": "parent-uuid",
    "productKey": "sinh-to-berrino",
    "name": "Sinh tố Berrino"
  },
  "optionGroups": [
    { "name": "Vị", "values": ["Dâu", "Đào", "Ổi"] }
  ],
  "variants": [
    {
      "variantId": "variant-uuid",
      "sku": "BGKQ-0015",
      "options": { "Vị": "Dâu" },
      "pricing": { "amount": 89000, "currency": "VND" },
      "image": { "objectKey": "catalog/hung-phat/v2/products/bgkq-0015.webp" }
    }
  ],
  "selectedVariantId": "variant-uuid"
}
```

## Selection rule

Frontend matches all selected option values against `variants[].options` and then stores the returned `variantId`. It must never reconstruct an SKU or save free-form option text as the cart identity.

## Cart line

```json
{
  "variantId": "variant-uuid",
  "quantity": 2
}
```

Database columns `cart_items.variant_id` and `order_items.variant_id` reference `catalog_variants.id`. Legacy `product_id` remains during cutover only.
