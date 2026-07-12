# Recipe + Admin completion plan

This document is the active integration path for completing Recipe and Admin from the current `main` branch.

## Branch policy

- Use one active integration branch: `feat/recipe-admin-stabilization`.
- Every commit must be independently buildable and reviewable.
- Do not merge the old stacked Recipe or AI pull requests into this branch.
- Old pull requests remain reference material only.

## Milestone A — Admin stabilization

- Repair Vietnamese UTF-8 text in the active Admin UI.
- Keep Customers and Orders behavior unchanged.
- Use route navigation for Products, Recipes and Recipe Scale.
- Keep Recipe management outside the large `AdminDashboard` state machine.
- Run a mojibake source scan before every frontend build.

Gate:

- Frontend typecheck and production build pass.
- `/admin`, `/admin/recipes`, and `/admin/recipes/scale` are present in the build route table.
- No known mojibake markers remain in Admin source.

## Milestone B — Recipe API contract

- Use `/api/recipes` as the canonical backend public contract.
- Keep `/api/public/recipes` as a temporary compatibility alias.
- Add list/detail smoke tests against the compatibility path.
- Ensure frontend and deployed backend use contracts represented in `main`.

Gate:

- Anonymous list and detail requests pass.
- Draft recipes are not exposed.
- Production smoke includes Recipe routes.

## Milestone C — Current admin workflow hardening

- Cover create, edit, submit review, request changes, approve, publish, archive and version listing.
- Give every editable Recipe ingredient and step a stable client-side identity.
- Expose or remove unused fields such as cover image, sort order and step image.
- Stabilize Recipe Scale when changing recipes or source versions.

Gate:

- Database migration verification passes on clean and upgraded schemas.
- Admin Recipe workflow integration tests pass.
- Scale tests cover missing yield, incompatible units and published/current source changes.

## Milestone D — Catalog readiness reconciliation

- Extend the current schema with additive migrations only.
- Add approved selections, selection key, structured package conversion and cart/cost readiness where missing.
- Reuse Catalog V2 validation and pricing contracts rather than duplicating them.

Gate:

- A Recipe ingredient cannot be cart-ready without a valid variant and required selections.
- Catalog rename or inactivation does not destroy historical Recipe snapshots.

## Milestone E — Revenue features

1. Deterministic cost engine.
2. Cart preview.
3. Atomic add-ingredients-to-cart.
4. Product-to-Recipe and Recipe-to-Product links in the frontend.

Gate:

- Pricing comes from the existing Catalog pricing contract.
- Cart identity remains `variantId + selectionKey`.
- No partial cart write is reported as full success.

## Deferred

AI and GCP work remain deferred until Milestones A–E are stable on `main` with required checks.
