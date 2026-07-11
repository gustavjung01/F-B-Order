BEGIN;

ALTER TABLE recipes
DROP CONSTRAINT IF EXISTS recipes_status_domain_check;

UPDATE recipes
SET status = CASE status
  WHEN 'published' THEN 'active'
  WHEN 'archived' THEN 'inactive'
  ELSE status
END
WHERE status IN ('published', 'archived');

ALTER TABLE recipes
ADD CONSTRAINT recipes_status_domain_check
CHECK (status IN ('draft','in_review','needs_review','active','inactive'));

COMMIT;