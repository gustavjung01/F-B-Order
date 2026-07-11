export const MIGRATION_FILES = Object.freeze([
  "db/migrations/001_init_core.sql",
  "db/migrations/002_catalog_domain_boundary.sql",
  "db/migrations/003_legacy_production_bridge.sql",
  "db/migrations/004_core_order_contract.sql",
  "db/migrations/005_order_engine.sql",
  "db/migrations/006_admin_operations.sql",
  "db/migrations/007_catalog_v2_variants.sql",
  "db/migrations/008_catalog_v2_cart_identity.sql",
  "db/migrations/009_catalog_groups_and_choices.sql",
  "db/migrations/010_recipe_admin_domain.sql",
  "db/migrations/011_recipe_review_publish_versioning.sql",
  "db/migrations/012_recipe_catalog_variant_links.sql",
  "db/migrations/013_catalog_variant_packaging_specs.sql",
  "db/migrations/014_recipe_status_contract.sql"
]);

export const BASELINE_MIGRATION_FILES = Object.freeze([
  "db/migrations/001_init_core.sql",
  "db/migrations/002_catalog_domain_boundary.sql",
  "db/migrations/003_legacy_production_bridge.sql",
  "db/migrations/004_core_order_contract.sql"
]);

export const MIGRATION_LOCK_KEYS = Object.freeze([5100, 20260621]);