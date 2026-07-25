# Catalog commercial map: dry-run, apply, rollback

The real supplier price workbook is private commercial data. Do not commit the workbook or generated JSON payload to this public repository.

## Private payload location

Default local path:

```text
data/private/catalog-imports/kenh-quan-commercial-map.json
```

The directory is ignored by Git. A different file can be selected with `--file=<path>`.

Payload rows contain the stable Catalog V2 SKU, sell unit, net measure, outer-package quantity and unit price. `derivedPackagePrice` is validated as `unitPrice × packageQuantity`, but it is reference-only and is not written as a discounted price tier.

## Safety model

- Validation opens no database connection.
- Dry-run uses `BEGIN READ ONLY` and ends with `ROLLBACK`.
- Apply requires `--apply` and an exact `--confirm-hash=<payloadHash>`.
- Remote apply or rollback additionally requires `--allow-remote-apply`.
- Apply writes one transaction and records before/after snapshots in `catalog_commercial_import_batches`.
- Rollback restores `catalog_variants.shop_price`, the complete prior `catalog_variants.options`, and the prior packaging row.
- Rollback refuses to run when current state differs from the batch after-snapshot. This prevents an old rollback from overwriting newer edits.
- The importer does not change `price_mode`, `is_orderable`, customer price groups, or discount tiers.

## Commands

Validate the private payload without a database:

```powershell
pnpm catalog:commercial:validate -- --file="data/private/catalog-imports/kenh-quan-commercial-map.json"
```

Read-only database audit:

```powershell
pnpm catalog:commercial:dry-run -- --file="data/private/catalog-imports/kenh-quan-commercial-map.json"
```

Apply locally after checking the dry-run report:

```powershell
pnpm catalog:commercial:apply -- --file="data/private/catalog-imports/kenh-quan-commercial-map.json" --confirm-hash=<PAYLOAD_SHA256>
```

Apply remotely only after an explicit database backup and approval:

```powershell
pnpm catalog:commercial:apply -- --file="data/private/catalog-imports/kenh-quan-commercial-map.json" --confirm-hash=<PAYLOAD_SHA256> --allow-remote-apply
```

Rollback using the `batchId` printed by a successful apply:

```powershell
pnpm catalog:commercial:rollback -- --rollback=<BATCH_UUID>
```

Remote rollback:

```powershell
pnpm catalog:commercial:rollback -- --rollback=<BATCH_UUID> --allow-remote-apply
```

## Imported fields

For each accepted SKU, the importer updates:

- `catalog_variants.shop_price`
- `catalog_variants.options.sell_unit`
- `catalog_variants.options.package`
- `catalog_variants.options.size`
- `catalog_variant_packaging_specs`

The Catalog detail API derives an outer-package reference price from the customer-visible unit price multiplied by `packageQuantity`. It is labeled as a reference price, not a supplier discount.
