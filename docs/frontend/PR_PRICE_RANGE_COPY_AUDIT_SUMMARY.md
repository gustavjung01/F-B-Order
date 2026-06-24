# PR summary

## Customer-facing copy

- Removed implementation terms such as parent card, variant_id, Catalog v2, backend, checkout variant and order v2 from customer screens.
- Corrected Vietnamese accents and replaced Clerk/admin wording in registration flows.
- Replaced development/demo placeholders with customer-facing empty states.
- Removed the stale hardcoded product count from the cart.
- Added a copy audit script to prevent the audited phrases from returning.

## Catalog price range

- List API returns variant count, minimum dealer price and maximum dealer price for each product.
- Catalog cards render one price when all variants share a price, otherwise render the minimum-to-maximum range.
- Detail pages retain the exact price for each selected SKU.
- Added a regression contract for Siro Mama Gold: 53.000 ₫ – 140.000 ₫.
