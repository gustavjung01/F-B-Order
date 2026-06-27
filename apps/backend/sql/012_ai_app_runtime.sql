CREATE TABLE IF NOT EXISTS ai_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  project_version_id UUID NOT NULL REFERENCES ai_project_versions(id),
  status TEXT NOT NULL DEFAULT 'draft',
  runtime_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  updated_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_app_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES ai_apps(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_project_agents(id),
  model_id UUID NOT NULL REFERENCES ai_project_models(id),
  slot_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  runtime_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  updated_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, slot_key),
  UNIQUE (app_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_apps_project_version
  ON ai_apps(project_version_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_app_agents_app_enabled
  ON ai_app_agents(app_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_ai_app_agents_agent
  ON ai_app_agents(agent_id);

DROP TRIGGER IF EXISTS trg_ai_apps_updated_at ON ai_apps;
CREATE TRIGGER trg_ai_apps_updated_at BEFORE UPDATE ON ai_apps
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_ai_app_agents_updated_at ON ai_app_agents;
CREATE TRIGGER trg_ai_app_agents_updated_at BEFORE UPDATE ON ai_app_agents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
