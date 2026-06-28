CREATE TABLE IF NOT EXISTS ai_recipe_draft_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL UNIQUE REFERENCES ai_documents(id) ON DELETE RESTRICT,
  recipe_id UUID NOT NULL UNIQUE REFERENCES recipes(id) ON DELETE RESTRICT,
  actor_staff_id UUID NOT NULL REFERENCES staff_users(id),
  agent_id UUID REFERENCES ai_project_agents(id) ON DELETE SET NULL,
  model_id UUID REFERENCES ai_project_models(id) ON DELETE SET NULL,
  source_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_recipe_draft_links_payload_shape_check CHECK (jsonb_typeof(source_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ai_recipe_draft_links_actor_created
  ON ai_recipe_draft_links(actor_staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recipe_draft_links_agent_created
  ON ai_recipe_draft_links(agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;
