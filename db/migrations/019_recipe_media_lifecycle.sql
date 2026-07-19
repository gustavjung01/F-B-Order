BEGIN;

CREATE TABLE IF NOT EXISTS recipe_media_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'attached', 'expired')),
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  attached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES recipe_media_drafts(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('cover', 'step')),
  object_key TEXT NOT NULL UNIQUE,
  thumbnail_object_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  original_file_name TEXT,
  content_type TEXT NOT NULL DEFAULT 'image/webp' CHECK (content_type = 'image/webp'),
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size > 0),
  thumbnail_byte_size INTEGER CHECK (thumbnail_byte_size IS NULL OR thumbnail_byte_size > 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'attached', 'detached', 'failed', 'deleted')),
  failure_reason TEXT,
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  uploaded_at TIMESTAMPTZ,
  attached_at TIMESTAMPTZ,
  detached_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS cover_media_id UUID REFERENCES recipe_media(id) ON DELETE SET NULL;

ALTER TABLE recipe_steps
  ADD COLUMN IF NOT EXISTS media_id UUID REFERENCES recipe_media(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS recipe_media_version_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES recipe_media(id) ON DELETE RESTRICT,
  usage TEXT NOT NULL CHECK (usage IN ('cover', 'step')),
  step_no INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (usage = 'cover' AND step_no IS NULL)
    OR (usage = 'step' AND step_no IS NOT NULL AND step_no > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_media_version_cover
  ON recipe_media_version_refs (version_id)
  WHERE usage = 'cover';

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_media_version_step
  ON recipe_media_version_refs (version_id, step_no)
  WHERE usage = 'step';

CREATE INDEX IF NOT EXISTS idx_recipe_media_version_refs_media
  ON recipe_media_version_refs (media_id);

CREATE INDEX IF NOT EXISTS idx_recipe_media_drafts_cleanup
  ON recipe_media_drafts (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_recipe_media_cleanup
  ON recipe_media (status, created_at)
  WHERE status IN ('pending', 'uploaded', 'detached', 'failed');

CREATE INDEX IF NOT EXISTS idx_recipe_media_recipe
  ON recipe_media (recipe_id, status);

CREATE INDEX IF NOT EXISTS idx_recipe_steps_media
  ON recipe_steps (media_id)
  WHERE media_id IS NOT NULL;

COMMIT;
