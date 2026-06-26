CREATE TABLE IF NOT EXISTS ai_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active_version_id UUID,
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
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
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version),
  UNIQUE (project_id, file_hash)
);

ALTER TABLE ai_projects
  ADD CONSTRAINT ai_projects_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES ai_project_versions(id);

CREATE TABLE IF NOT EXISTS ai_project_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_version_id UUID NOT NULL REFERENCES ai_project_versions(id) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (project_version_id, model_key)
);

CREATE TABLE IF NOT EXISTS ai_project_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_version_id UUID NOT NULL REFERENCES ai_project_versions(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  use_case TEXT NOT NULL,
  model_key TEXT NOT NULL,
  system_instruction TEXT,
  input_schema JSONB NOT NULL,
  output_schema JSONB NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'untrusted',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (project_version_id, agent_key)
);

CREATE TABLE IF NOT EXISTS ai_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  project_version_id UUID REFERENCES ai_project_versions(id),
  agent_id UUID REFERENCES ai_project_agents(id),
  model_id UUID REFERENCES ai_project_models(id),
  schema_version TEXT NOT NULL,
  json_payload JSONB NOT NULL,
  validation_status TEXT NOT NULL,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  updated_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_project_versions_project_created
  ON ai_project_versions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_project_models_version
  ON ai_project_models(project_version_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_ai_project_agents_version
  ON ai_project_agents(project_version_id, review_status, is_enabled);
CREATE INDEX IF NOT EXISTS idx_ai_documents_status_created
  ON ai_documents(status, created_at DESC);
