CREATE TABLE IF NOT EXISTS ai_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES ai_projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version TEXT NOT NULL,
  source_filename TEXT,
  file_hash TEXT NOT NULL,
  json_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version),
  UNIQUE (project_id, file_hash)
);
