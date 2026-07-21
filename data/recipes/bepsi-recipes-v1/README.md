# B?p S? recipes v1

- 64 recipes, 12 categories.
- 60 cover images map to R2 keys under `recipes/`.
- Four internal recipes intentionally have no image: `thach-tra`, `thach-ca-phe`, `sot-duong-den`, `nuoc-duong-tieu-chuan`.
- Upload images: `pnpm --filter @fb-order/backend recipe:images:upload`.
- Dry-run import: `pnpm --filter @fb-order/backend recipe:content:import`.
- Apply import after migration 020: append `-- --apply`.
- Recipes remain `draft`; this importer never publishes.
