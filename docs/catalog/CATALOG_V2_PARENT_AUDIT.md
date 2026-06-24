# Catalog V2 parent audit

The parent-card count is derived from the repository-owned mapping and is no longer assumed to be 188.

Current audited result: **182 parent cards / 275 variants**.

Run:

```bash
pnpm catalog:map:v2
pnpm catalog:preview:parent:v2
```

Inputs and results:

- `data/catalog/hung-phat/v2/parent-map-fixes.json`
- `data/catalog/hung-phat/v2/parent-map-audit.json`
- generated output: `data/catalog/hung-phat/v2/generated/`

This branch does not upload R2 assets, modify the production database, cut over the catalog, or deploy the VPS.
