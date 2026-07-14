-- Repair the exact mojibake Recipe title observed in production.
-- Recipe version snapshots are immutable, so referenced current/published versions
-- are cloned with corrected snapshots and the recipe pointers move to the clones.
-- Historical versions remain untouched as an audit trail.

BEGIN;

DO $$
DECLARE
  recipe_row RECORD;
  source_version recipe_versions%ROWTYPE;
  next_version_no INTEGER;
  corrected_current_id UUID;
  corrected_published_id UUID;
BEGIN
  FOR recipe_row IN
    SELECT id, current_version_id, published_version_id
    FROM recipes
    WHERE title = 'Tr� S?a H?ng Tr�'
    FOR UPDATE
  LOOP
    UPDATE recipes
    SET title = 'Trà Sữa Hùng Trà'
    WHERE id = recipe_row.id;

    corrected_current_id := recipe_row.current_version_id;
    corrected_published_id := recipe_row.published_version_id;

    SELECT COALESCE(MAX(version_no), 0) + 1
    INTO next_version_no
    FROM recipe_versions
    WHERE recipe_id = recipe_row.id;

    IF recipe_row.current_version_id IS NOT NULL THEN
      SELECT *
      INTO source_version
      FROM recipe_versions
      WHERE id = recipe_row.current_version_id;

      IF FOUND AND source_version.snapshot ->> 'title' = 'Tr� S?a H?ng Tr�' THEN
        INSERT INTO recipe_versions (
          recipe_id,
          version_no,
          workflow_status,
          snapshot,
          change_note,
          created_by_staff_id,
          reviewed_by_staff_id,
          reviewed_at,
          review_note,
          published_by_staff_id,
          published_at,
          created_at
        ) VALUES (
          source_version.recipe_id,
          next_version_no,
          source_version.workflow_status,
          jsonb_set(source_version.snapshot, '{title}', to_jsonb('Trà Sữa Hùng Trà'::text), true),
          concat_ws(E'\n', source_version.change_note, 'UTF-8 title repair'),
          source_version.created_by_staff_id,
          source_version.reviewed_by_staff_id,
          source_version.reviewed_at,
          source_version.review_note,
          source_version.published_by_staff_id,
          source_version.published_at,
          now()
        )
        RETURNING id INTO corrected_current_id;

        next_version_no := next_version_no + 1;
      END IF;
    END IF;

    IF recipe_row.published_version_id IS NOT NULL THEN
      IF recipe_row.published_version_id = recipe_row.current_version_id THEN
        corrected_published_id := corrected_current_id;
      ELSE
        SELECT *
        INTO source_version
        FROM recipe_versions
        WHERE id = recipe_row.published_version_id;

        IF FOUND AND source_version.snapshot ->> 'title' = 'Tr� S?a H?ng Tr�' THEN
          INSERT INTO recipe_versions (
            recipe_id,
            version_no,
            workflow_status,
            snapshot,
            change_note,
            created_by_staff_id,
            reviewed_by_staff_id,
            reviewed_at,
            review_note,
            published_by_staff_id,
            published_at,
            created_at
          ) VALUES (
            source_version.recipe_id,
            next_version_no,
            source_version.workflow_status,
            jsonb_set(source_version.snapshot, '{title}', to_jsonb('Trà Sữa Hùng Trà'::text), true),
            concat_ws(E'\n', source_version.change_note, 'UTF-8 title repair'),
            source_version.created_by_staff_id,
            source_version.reviewed_by_staff_id,
            source_version.reviewed_at,
            source_version.review_note,
            source_version.published_by_staff_id,
            source_version.published_at,
            now()
          )
          RETURNING id INTO corrected_published_id;
        END IF;
      END IF;
    END IF;

    UPDATE recipes
    SET
      current_version_id = corrected_current_id,
      published_version_id = corrected_published_id
    WHERE id = recipe_row.id;
  END LOOP;
END $$;

COMMIT;
