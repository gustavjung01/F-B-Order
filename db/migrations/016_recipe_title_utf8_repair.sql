-- Repair the exact mojibake Recipe title observed in production.
-- Scope is intentionally narrow: the live recipe row and immutable version snapshots only.

BEGIN;

UPDATE recipes
SET title = 'Trà Sữa Hùng Trà'
WHERE title = 'Tr� S?a H?ng Tr�';

UPDATE recipe_versions
SET snapshot = jsonb_set(
  snapshot,
  '{title}',
  to_jsonb('Trà Sữa Hùng Trà'::text),
  true
)
WHERE snapshot ->> 'title' = 'Tr� S?a H?ng Tr�';

COMMIT;
