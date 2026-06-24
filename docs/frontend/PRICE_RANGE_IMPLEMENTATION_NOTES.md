# Parent card price range contract

- Product list cards expose `variantCount`, `priceMin`, and `priceMax`.
- A single price is shown when `priceMin === priceMax`.
- A range is shown when active fixed-price variants differ.
- Market-price-only products retain the `Thời giá` label.
- Product detail continues to show the exact price for the selected SKU.
- Siro Mama Gold is the regression case: 53.000 ₫ – 140.000 ₫.
