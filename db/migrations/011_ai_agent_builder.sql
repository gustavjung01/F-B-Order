-- Báº¿p Sá»‰ F&B - Agent Builder control plane and initial system data.
-- This migration stores configuration only. It does not call an LLM provider and does not contain provider credentials.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ai_model_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('google_vertex', 'openai', 'anthropic', 'custom')),
  model_name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  output_style JSONB NOT NULL DEFAULT '{}'::jsonb,
  locale TEXT NOT NULL DEFAULT 'vi-VN',
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_policy_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  quota_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_tool_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('read', 'calculation', 'draft_write', 'action')),
  audience TEXT[] NOT NULL DEFAULT ARRAY['admin']::TEXT[],
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  side_effect_level TEXT NOT NULL DEFAULT 'none' CHECK (side_effect_level IN ('none', 'draft_only', 'confirmation_required')),
  implementation_status TEXT NOT NULL DEFAULT 'planned' CHECK (implementation_status IN ('planned', 'ready', 'disabled')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('curated', 'backend_tool', 'file', 'external_connector')),
  access_mode TEXT NOT NULL CHECK (access_mode IN ('snapshot', 'live_tool', 'manual_import')),
  classification TEXT NOT NULL DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'restricted')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
  document_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'vi-VN',
  revision INT NOT NULL DEFAULT 1 CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, document_key, revision)
);

CREATE TABLE IF NOT EXISTS ai_agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('admin', 'customer', 'internal')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  active_version_id UUID,
  created_by_actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agent_definitions(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded', 'archived')),
  model_profile_id UUID NOT NULL REFERENCES ai_model_profiles(id),
  persona_id UUID NOT NULL REFERENCES ai_personas(id),
  policy_profile_id UUID NOT NULL REFERENCES ai_policy_profiles(id),
  system_instructions TEXT NOT NULL,
  greeting TEXT,
  output_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_tool_calls INT NOT NULL DEFAULT 6 CHECK (max_tool_calls BETWEEN 0 AND 20),
  max_context_items INT NOT NULL DEFAULT 12 CHECK (max_context_items BETWEEN 0 AND 100),
  created_by_actor_id TEXT,
  released_by_actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  UNIQUE (agent_id, version)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_agent_definitions_active_version_fk'
  ) THEN
    ALTER TABLE ai_agent_definitions
      ADD CONSTRAINT ai_agent_definitions_active_version_fk
      FOREIGN KEY (active_version_id) REFERENCES ai_agent_versions(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS ai_agent_version_tools (
  agent_version_id UUID NOT NULL REFERENCES ai_agent_versions(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES ai_tool_definitions(id),
  position INT NOT NULL DEFAULT 0 CHECK (position >= 0),
  override_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (agent_version_id, tool_id)
);

CREATE TABLE IF NOT EXISTS ai_agent_version_knowledge_sources (
  agent_version_id UUID NOT NULL REFERENCES ai_agent_versions(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES ai_knowledge_sources(id),
  position INT NOT NULL DEFAULT 0 CHECK (position >= 0),
  retrieval_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (agent_version_id, source_id)
);

CREATE TABLE IF NOT EXISTS ai_agent_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agent_definitions(id) ON DELETE CASCADE,
  agent_version_id UUID REFERENCES ai_agent_versions(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'system')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_model_profiles_status_idx ON ai_model_profiles(status);
CREATE INDEX IF NOT EXISTS ai_personas_status_idx ON ai_personas(status);
CREATE INDEX IF NOT EXISTS ai_policy_profiles_status_idx ON ai_policy_profiles(status);
CREATE INDEX IF NOT EXISTS ai_tool_definitions_status_idx ON ai_tool_definitions(status, implementation_status);
CREATE INDEX IF NOT EXISTS ai_knowledge_sources_status_idx ON ai_knowledge_sources(status);
CREATE INDEX IF NOT EXISTS ai_knowledge_documents_source_status_idx ON ai_knowledge_documents(source_id, status);
CREATE INDEX IF NOT EXISTS ai_agent_definitions_status_idx ON ai_agent_definitions(status, audience);
CREATE INDEX IF NOT EXISTS ai_agent_versions_agent_version_idx ON ai_agent_versions(agent_id, version DESC);
CREATE INDEX IF NOT EXISTS ai_agent_change_logs_agent_created_idx ON ai_agent_change_logs(agent_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_ai_agent_change_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_agent_change_logs_append_only ON ai_agent_change_logs;
CREATE TRIGGER ai_agent_change_logs_append_only
BEFORE UPDATE OR DELETE ON ai_agent_change_logs
FOR EACH ROW EXECUTE FUNCTION prevent_ai_agent_change_log_mutation();

-- Builder resources. No API keys or provider project IDs live in the database.
INSERT INTO ai_model_profiles (profile_key, provider, model_name, config, status)
VALUES (
  'vertex-agent-builder-default',
  'google_vertex',
  'CONFIGURE_AT_DEPLOYMENT',
  '{
    "adapter": "vertex_agent_builder",
    "credentials": "environment_or_workload_identity_only",
    "notes": "Set a concrete model and project outside this repository before activation."
  }'::jsonb,
  'draft'
)
ON CONFLICT (profile_key) DO NOTHING;

INSERT INTO ai_personas (persona_key, name, description, content, output_style, locale, version, status)
VALUES (
  'bepsi-culinary-expert-v1',
  'Báº¿p Sá»‰ Culinary Expert',
  'ChuyÃªn gia phÃ¡t triá»ƒn mÃ³n, chuáº©n hÃ³a cÃ´ng thá»©c vÃ  váº­n hÃ nh F&B táº¡i Viá»‡t Nam.',
  $persona$
Báº¡n lÃ  chuyÃªn gia áº©m thá»±c F&B thá»±c chiáº¿n táº¡i Viá»‡t Nam cá»§a Báº¿p Sá»‰.

Pháº¡m vi chuyÃªn mÃ´n:
- PhÃ¡t triá»ƒn mÃ³n, chuáº©n hÃ³a Ä‘á»‹nh lÆ°á»£ng, quy trÃ¬nh pha cháº¿ vÃ  cháº¿ biáº¿n.
- Cháº©n Ä‘oÃ¡n lá»—i mÃ³n tá»« triá»‡u chá»©ng, Ä‘Æ°a ra nguyÃªn nhÃ¢n theo má»©c Ä‘á»™ kháº£ nÄƒng.
- TÃ­nh giÃ¡ vá»‘n, gá»£i Ã½ giÃ¡ bÃ¡n, combo, mÃ¹a bÃ¡n vÃ  váº­n hÃ nh cho quÃ¡n nhá», vá»«a.
- Hiá»ƒu trÃ  sá»¯a, trÃ  trÃ¡i cÃ¢y, cÃ  phÃª, Ä‘á»“ Äƒn váº·t, mÃ¬ cay, láº©u vÃ  cÃ¡c mÃ³n phá»• biáº¿n táº¡i Viá»‡t Nam.

CÃ¡ch tráº£ lá»i:
- Quyáº¿t Ä‘oÃ¡n, thá»±c táº¿, cÃ³ phÆ°Æ¡ng Ã¡n Æ°u tiÃªn vÃ  nÃªu rÃµ Ä‘Ã¡nh Ä‘á»•i.
- Khi thiáº¿u dá»¯ liá»‡u, Ä‘Æ°a ra giáº£ Ä‘á»‹nh há»£p lÃ½ trÆ°á»›c; chá»‰ há»i thÃªm khi dá»¯ liá»‡u thiáº¿u cÃ³ thá»ƒ lÃ m káº¿t luáº­n sai Ä‘Ã¡ng ká»ƒ.
- PhÃ¢n biá»‡t trong láº­p luáº­n giá»¯a dá»¯ liá»‡u Báº¿p Sá»‰, kiáº¿n thá»©c chuyÃªn mÃ´n vÃ  suy luáº­n/giáº£ Ä‘á»‹nh.
- Æ¯u tiÃªn nguyÃªn liá»‡u Báº¿p Sá»‰ khi phÃ¹ há»£p ká»¹ thuáº­t, khÃ´ng Ã©p sáº£n pháº©m vÃ o cÃ´ng thá»©c khi khÃ´ng há»£p.
- KhÃ´ng dÃ¹ng cÃ¢u tráº£ lá»i chung chung. CÃ³ nhiá»u hÆ°á»›ng thÃ¬ xáº¿p háº¡ng vÃ  giáº£i thÃ­ch vÃ¬ sao.
$persona$,
  '{
    "language": "vi",
    "tone": ["quyet_doan", "thuc_te", "co_cau_truc"],
    "answer_sections": ["khuyen_nghi", "ly_do", "gia_dinh", "buoc_tiep_theo"]
  }'::jsonb,
  'vi-VN',
  1,
  'active'
)
ON CONFLICT (persona_key) DO NOTHING;

INSERT INTO ai_policy_profiles (policy_key, name, description, rule_config, quota_config, version, status)
VALUES (
  'bepsi-safe-actions-v1',
  'Báº¿p Sá»‰ Safe Actions',
  'Ranh giá»›i dá»¯ liá»‡u, quyá»n hÃ nh Ä‘á»™ng vÃ  yÃªu cáº§u xÃ¡c nháº­n cho agent Báº¿p Sá»‰.',
  '{
    "truth_boundaries": {
      "product_existence": "backend_tool_required",
      "sku": "backend_tool_required",
      "price": "backend_tool_required",
      "stock": "backend_tool_required",
      "cart": "backend_tool_required",
      "orders": "backend_tool_required",
      "approved_recipe": "backend_tool_required"
    },
    "write_actions": {
      "published_recipe": "forbidden",
      "database_direct_write": "forbidden",
      "draft_creation": "allowed_through_tool_only",
      "cart_or_order": "explicit_user_confirmation_required"
    },
    "reasoning": {
      "allow_domain_knowledge": true,
      "mark_material_assumptions": true,
      "do_not_invent_internal_facts": true
    },
    "privacy": {
      "do_not_expose_other_customer_data": true,
      "do_not_expose_internal_cost_without_permission": true
    }
  }'::jsonb,
  '{
    "max_turns_per_session": 20,
    "max_tool_calls_per_turn": 6,
    "max_tool_calls_per_session": 60,
    "require_runtime_telemetry": true
  }'::jsonb,
  1,
  'active'
)
ON CONFLICT (policy_key) DO NOTHING;

INSERT INTO ai_tool_definitions (
  tool_key, name, description, category, audience, input_schema, output_schema,
  side_effect_level, implementation_status, status
)
VALUES
(
  'catalog.search-products',
  'Tra cá»©u catalog sáº£n pháº©m',
  'TÃ¬m sáº£n pháº©m Báº¿p Sá»‰ theo tá»« khÃ³a, tÃªn gá»i, SKU hoáº·c nhÃ³m hÃ ng. GiÃ¡ vÃ  SKU chá»‰ Ä‘Æ°á»£c tráº£ tá»« backend theo quyá»n.',
  'read',
  ARRAY['admin', 'customer'],
  '{"type":"object","required":["query"],"properties":{"query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":20}}}'::jsonb,
  '{"type":"object","properties":{"products":{"type":"array"},"pricingScope":{"type":"string"}}}'::jsonb,
  'none',
  'planned',
  'active'
),
(
  'catalog.get-product-detail',
  'Láº¥y chi tiáº¿t sáº£n pháº©m',
  'Láº¥y quy cÃ¡ch, kháº£ nÄƒng Ä‘áº·t hÃ ng vÃ  dá»¯ liá»‡u thÆ°Æ¡ng máº¡i Ä‘Æ°á»£c phÃ©p xem cho má»™t sáº£n pháº©m.',
  'read',
  ARRAY['admin', 'customer'],
  '{"type":"object","required":["productId"],"properties":{"productId":{"type":"string"}}}'::jsonb,
  '{"type":"object","properties":{"product":{"type":"object"}}}'::jsonb,
  'none',
  'planned',
  'active'
),
(
  'recipe.get-approved',
  'Láº¥y cÃ´ng thá»©c Ä‘Ã£ duyá»‡t',
  'Äá»c cÃ´ng thá»©c Báº¿p Sá»‰ Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t vÃ  nguyÃªn liá»‡u liÃªn káº¿t; khÃ´ng tráº£ báº£n nhÃ¡p hoáº·c báº£n ná»™i bá»™ khÃ´ng Ä‘Æ°á»£c phÃ©p.',
  'read',
  ARRAY['admin', 'customer'],
  '{"type":"object","properties":{"recipeId":{"type":"string"},"slug":{"type":"string"}}}'::jsonb,
  '{"type":"object","properties":{"recipe":{"type":"object"}}}'::jsonb,
  'none',
  'planned',
  'active'
),
(
  'recipe.calculate-scale',
  'Scale cÃ´ng thá»©c',
  'TÃ­nh láº¡i Ä‘á»‹nh lÆ°á»£ng cÃ´ng thá»©c theo sá»‘ pháº§n mong muá»‘n, khÃ´ng tá»± thay Ä‘á»•i dá»¯ liá»‡u cÃ´ng thá»©c gá»‘c.',
  'calculation',
  ARRAY['admin', 'customer'],
  '{"type":"object","required":["recipeId","targetServings"],"properties":{"recipeId":{"type":"string"},"targetServings":{"type":"number","exclusiveMinimum":0}}}'::jsonb,
  '{"type":"object","properties":{"ingredients":{"type":"array"},"assumptions":{"type":"array"}}}'::jsonb,
  'none',
  'planned',
  'active'
),
(
  'recipe.calculate-cost',
  'TÃ­nh giÃ¡ vá»‘n cÃ´ng thá»©c',
  'TÃ­nh giÃ¡ vá»‘n tá»« dá»¯ liá»‡u sáº£n pháº©m vÃ  giÃ¡ theo quyá»n. KhÃ´ng cÃ´ng bá»‘ giÃ¡ náº¿u khÃ´ng cÃ³ tool result há»£p lá»‡.',
  'calculation',
  ARRAY['admin'],
  '{"type":"object","required":["recipeId"],"properties":{"recipeId":{"type":"string"},"servings":{"type":"number","exclusiveMinimum":0}}}'::jsonb,
  '{"type":"object","properties":{"totalCost":{"type":"number"},"costPerServing":{"type":"number"},"evidence":{"type":"array"}}}'::jsonb,
  'none',
  'planned',
  'active'
),
(
  'recipe.create-draft',
  'Táº¡o báº£n nhÃ¡p cÃ´ng thá»©c',
  'Táº¡o báº£n nhÃ¡p cÃ³ audit cho admin. KhÃ´ng Ä‘Æ°á»£c publish, ghi Ä‘Ã¨ cÃ´ng thá»©c active hoáº·c táº¡o thay Ä‘á»•i Ã¢m tháº§m.',
  'draft_write',
  ARRAY['admin'],
  '{"type":"object","required":["title","sections"],"properties":{"title":{"type":"string"},"sections":{"type":"object"},"sourceRecipeId":{"type":"string"}}}'::jsonb,
  '{"type":"object","properties":{"draftId":{"type":"string"},"status":{"type":"string"}}}'::jsonb,
  'draft_only',
  'planned',
  'active'
)
ON CONFLICT (tool_key) DO NOTHING;

INSERT INTO ai_knowledge_sources (
  source_key, name, description, source_type, access_mode, classification, config, status
)
VALUES
(
  'bepsi-agent-foundation',
  'Ná»n táº£ng tÆ° váº¥n Báº¿p Sá»‰',
  'TÃ i liá»‡u ná»™i bá»™ Ä‘Ã£ duyá»‡t vá» ranh giá»›i dá»¯ liá»‡u vÃ  chuáº©n tÆ° váº¥n F&B.',
  'curated',
  'snapshot',
  'internal',
  '{"owner":"product","refresh":"manual_review","approved_for_agent":true}'::jsonb,
  'active'
),
(
  'bepsi-live-catalog',
  'Catalog Báº¿p Sá»‰ trá»±c tiáº¿p',
  'Nguá»“n dá»¯ liá»‡u catalog sá»‘ng. Chá»‰ truy cáº­p qua backend tool Ä‘á»ƒ Ã¡p dá»¥ng quyá»n, giÃ¡ vÃ  tráº¡ng thÃ¡i Ä‘áº·t hÃ ng.',
  'backend_tool',
  'live_tool',
  'internal',
  '{"toolKey":"catalog.search-products","requiresBackendAuthorization":true}'::jsonb,
  'active'
),
(
  'bepsi-approved-recipes',
  'CÃ´ng thá»©c Báº¿p Sá»‰ Ä‘Ã£ duyá»‡t',
  'Nguá»“n cÃ´ng thá»©c Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t. Báº£n nhÃ¡p vÃ  cÃ´ng thá»©c chÆ°a duyá»‡t khÃ´ng Ä‘Æ°á»£c xem á»Ÿ luá»“ng khÃ¡ch.',
  'backend_tool',
  'live_tool',
  'internal',
  '{"toolKey":"recipe.get-approved","requiresApprovalStatus":"active"}'::jsonb,
  'active'
)
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO ai_knowledge_documents (source_id, document_key, title, content_markdown, locale, revision, status)
SELECT source.id,
       document.document_key,
       document.title,
       document.content_markdown,
       'vi-VN',
       1,
       'active'
FROM ai_knowledge_sources source
CROSS JOIN (
  VALUES
  (
    'bepsi-agent-foundation',
    'bepsi-data-boundaries-v1',
    'Ranh giá»›i dá»¯ liá»‡u Báº¿p Sá»‰',
    $doc$
# Ranh giá»›i dá»¯ liá»‡u

- GiÃ¡, SKU, tá»“n kho, quy cÃ¡ch, tráº¡ng thÃ¡i orderable, giá» hÃ ng, Ä‘Æ¡n hÃ ng vÃ  cÃ´ng thá»©c Ä‘Ã£ duyá»‡t lÃ  dá»¯ liá»‡u Báº¿p Sá»‰.
- CÃ¡c dá»¯ liá»‡u nÃ y chá»‰ há»£p lá»‡ khi cÃ³ káº¿t quáº£ tool backend tÆ°Æ¡ng á»©ng.
- KhÃ´ng suy Ä‘oÃ¡n sáº£n pháº©m cÃ³ tá»“n táº¡i, khÃ´ng bá»‹a giÃ¡, khÃ´ng bá»‹a SKU vÃ  khÃ´ng suy ra Ä‘Æ¡n hÃ ng cá»§a khÃ¡ch khÃ¡c.
- Khi chÆ°a cÃ³ dá»¯ liá»‡u live, giáº£i thÃ­ch nguyÃªn táº¯c hoáº·c Ä‘á» xuáº¥t phÆ°Æ¡ng Ã¡n, Ä‘á»“ng thá»i nÃªu rÃµ pháº§n nÃ o cáº§n kiá»ƒm tra trÃªn há»‡ thá»‘ng.
$doc$
  ),
  (
    'bepsi-agent-foundation',
    'bepsi-advisory-standard-v1',
    'Chuáº©n tÆ° váº¥n F&B thá»±c chiáº¿n',
    $doc$
# Chuáº©n tÆ° váº¥n F&B

1. Chá»‘t má»¥c tiÃªu váº­n hÃ nh hoáº·c mÃ³n cáº§n giáº£i quyáº¿t.
2. NÃªu phÆ°Æ¡ng Ã¡n Æ°u tiÃªn trÆ°á»›c, rá»“i má»›i nÃ³i phÆ°Æ¡ng Ã¡n thay tháº¿.
3. Giáº£i thÃ­ch nguyÃªn nhÃ¢n theo ká»¹ thuáº­t, chi phÃ­ vÃ  kháº£ nÄƒng váº­n hÃ nh.
4. NÃªu cÃ¡c giáº£ Ä‘á»‹nh cÃ³ áº£nh hÆ°á»Ÿng Ä‘Ã¡ng ká»ƒ Ä‘áº¿n káº¿t luáº­n.
5. ÄÆ°a ra bÆ°á»›c tiáº¿p theo cÃ³ thá»ƒ lÃ m ngay.

KhÃ´ng thay tháº¿ dá»¯ liá»‡u tháº­t báº±ng lá»i khuyÃªn chung chung. Khi thiáº¿u thÃ´ng sá»‘, dÃ¹ng khoáº£ng an toÃ n vÃ  nÃ³i rÃµ má»©c Ä‘á»™ cháº¯c cháº¯n.
$doc$
  ),
  (
    'bepsi-agent-foundation',
    'bepsi-action-policy-v1',
    'ChÃ­nh sÃ¡ch hÃ nh Ä‘á»™ng cá»§a Agent',
    $doc$
# ChÃ­nh sÃ¡ch hÃ nh Ä‘á»™ng

- Agent cÃ³ thá»ƒ suy luáº­n, pháº£n biá»‡n cÃ´ng thá»©c vÃ  Ä‘á» xuáº¥t cáº£i tiáº¿n.
- Agent khÃ´ng tá»± publish, khÃ´ng tá»± sá»­a báº£n cÃ´ng thá»©c active, khÃ´ng tá»± thÃªm giá» hÃ ng hoáº·c táº¡o Ä‘Æ¡n.
- Táº¡o báº£n nhÃ¡p chá»‰ qua tool cÃ³ audit vÃ  chá»‰ dÃ nh cho quyá»n admin.
- Má»i thao tÃ¡c cÃ³ háº­u quáº£ pháº£i do backend kiá»ƒm tra quyá»n; UI hoáº·c prompt khÃ´ng pháº£i lÃ  lá»›p báº£o máº­t.
$doc$
  )
) AS document(source_key, document_key, title, content_markdown)
WHERE source.source_key = document.source_key
  AND NOT EXISTS (
    SELECT 1
    FROM ai_knowledge_documents existing
    WHERE existing.source_id = source.id
      AND existing.document_key = document.document_key
      AND existing.revision = 1
  );

INSERT INTO ai_agent_definitions (agent_key, name, description, audience, status, created_by_actor_id)
VALUES (
  'bepsi-culinary-expert',
  'Báº¿p Sá»‰ Culinary Expert',
  'Agent tÆ° váº¥n cÃ´ng thá»©c, ká»¹ thuáº­t F&B, giÃ¡ vá»‘n vÃ  váº­n hÃ nh. Seed á»Ÿ tráº¡ng thÃ¡i draft cho Ä‘áº¿n khi tools vÃ  provider hoÃ n thiá»‡n.',
  'admin',
  'draft',
  'system:migration-011'
)
ON CONFLICT (agent_key) DO NOTHING;

WITH agent AS (
  SELECT id FROM ai_agent_definitions WHERE agent_key = 'bepsi-culinary-expert'
), model AS (
  SELECT id FROM ai_model_profiles WHERE profile_key = 'vertex-agent-builder-default'
), persona AS (
  SELECT id FROM ai_personas WHERE persona_key = 'bepsi-culinary-expert-v1'
), policy AS (
  SELECT id FROM ai_policy_profiles WHERE policy_key = 'bepsi-safe-actions-v1'
)
INSERT INTO ai_agent_versions (
  agent_id, version, status, model_profile_id, persona_id, policy_profile_id,
  system_instructions, greeting, output_contract, max_tool_calls, max_context_items, created_by_actor_id
)
SELECT
  agent.id,
  1,
  'draft',
  model.id,
  persona.id,
  policy.id,
  $instructions$
Báº¡n lÃ  BepsiCulinaryExpertAgent. Má»¥c tiÃªu lÃ  giÃºp admin Báº¿p Sá»‰ phÃ¡t triá»ƒn, chuáº©n hÃ³a vÃ  Ä‘Ã¡nh giÃ¡ cÃ´ng thá»©c F&B theo hÆ°á»›ng bÃ¡n Ä‘Æ°á»£c vÃ  váº­n hÃ nh Ä‘Æ°á»£c.

Báº¯t buá»™c:
- DÃ¹ng tool backend khi cÃ¢u tráº£ lá»i phá»¥ thuá»™c vÃ o sáº£n pháº©m, giÃ¡, SKU, tá»“n kho, quy cÃ¡ch, giá» hÃ ng, Ä‘Æ¡n hÃ ng hoáº·c cÃ´ng thá»©c Báº¿p Sá»‰ Ä‘Ã£ duyá»‡t.
- KhÃ´ng bá»‹a dá»¯ liá»‡u ná»™i bá»™. KhÃ´ng xÃ¡c nháº­n má»™t con sá»‘ thÆ°Æ¡ng máº¡i khi chÆ°a cÃ³ evidence tá»« tool.
- CÃ³ thá»ƒ dÃ¹ng kiáº¿n thá»©c chuyÃªn mÃ´n Ä‘á»ƒ suy luáº­n, nhÆ°ng pháº£i nÃªu rÃµ giáº£ Ä‘á»‹nh náº¿u nÃ³ lÃ m thay Ä‘á»•i Ä‘Ã¡ng ká»ƒ káº¿t luáº­n.
- KhÃ´ng ghi trá»±c tiáº¿p vÃ o database. Báº£n nhÃ¡p chá»‰ Ä‘Æ°á»£c táº¡o qua tool recipe.create-draft vÃ  váº«n cáº§n admin duyá»‡t.
- Khi cÃ³ nhiá»u lá»±a chá»n, xáº¿p háº¡ng phÆ°Æ¡ng Ã¡n vÃ  giáº£i thÃ­ch Ä‘Ã¡nh Ä‘á»•i ká»¹ thuáº­t, giÃ¡ vá»‘n vÃ  váº­n hÃ nh.

Äáº§u ra nÃªn cÃ³: khuyáº¿n nghá»‹ chÃ­nh, lÃ½ do, giáº£ Ä‘á»‹nh/evidence vÃ  bÆ°á»›c tiáº¿p theo.
$instructions$,
  'MÃ¬nh lÃ  trá»£ lÃ½ F&B cá»§a Báº¿p Sá»‰. HÃ£y cho mÃ¬nh mÃ³n, quy mÃ´ bÃ¡n vÃ  váº¥n Ä‘á» báº¡n Ä‘ang gáº·p, mÃ¬nh sáº½ bÃ³c tÃ¡ch theo ká»¹ thuáº­t, giÃ¡ vá»‘n vÃ  váº­n hÃ nh.',
  '{
    "type": "object",
    "required": ["answer", "assumptions", "nextBestAction"],
    "properties": {
      "answer": {"type": "string"},
      "evidence": {"type": "array"},
      "assumptions": {"type": "array"},
      "nextBestAction": {"type": "string"},
      "confidence": {"type": "string", "enum": ["high", "medium", "low"]}
    }
  }'::jsonb,
  6,
  12,
  'system:migration-011'
FROM agent, model, persona, policy
WHERE NOT EXISTS (
  SELECT 1
  FROM ai_agent_versions existing
  WHERE existing.agent_id = agent.id AND existing.version = 1
);

INSERT INTO ai_agent_version_tools (agent_version_id, tool_id, position)
SELECT version.id, tool.id, ranked.position
FROM ai_agent_versions version
JOIN ai_agent_definitions agent ON agent.id = version.agent_id AND agent.agent_key = 'bepsi-culinary-expert'
JOIN (
  VALUES
    ('catalog.search-products', 0),
    ('catalog.get-product-detail', 1),
    ('recipe.get-approved', 2),
    ('recipe.calculate-scale', 3),
    ('recipe.calculate-cost', 4),
    ('recipe.create-draft', 5)
) AS ranked(tool_key, position) ON true
JOIN ai_tool_definitions tool ON tool.tool_key = ranked.tool_key
WHERE version.version = 1
ON CONFLICT (agent_version_id, tool_id) DO NOTHING;

INSERT INTO ai_agent_version_knowledge_sources (agent_version_id, source_id, position)
SELECT version.id, source.id, ranked.position
FROM ai_agent_versions version
JOIN ai_agent_definitions agent ON agent.id = version.agent_id AND agent.agent_key = 'bepsi-culinary-expert'
JOIN (
  VALUES
    ('bepsi-agent-foundation', 0),
    ('bepsi-live-catalog', 1),
    ('bepsi-approved-recipes', 2)
) AS ranked(source_key, position) ON true
JOIN ai_knowledge_sources source ON source.source_key = ranked.source_key
WHERE version.version = 1
ON CONFLICT (agent_version_id, source_id) DO NOTHING;

INSERT INTO ai_agent_change_logs (agent_id, agent_version_id, actor_type, actor_id, action, payload)
SELECT agent.id,
       version.id,
       'system',
       'system:migration-011',
       'agent.seeded',
       '{"version":1,"runtimeStatus":"blocked_until_provider_and_tools_are_ready"}'::jsonb
FROM ai_agent_definitions agent
JOIN ai_agent_versions version ON version.agent_id = agent.id AND version.version = 1
WHERE agent.agent_key = 'bepsi-culinary-expert'
  AND NOT EXISTS (
    SELECT 1
    FROM ai_agent_change_logs log
    WHERE log.agent_id = agent.id
      AND log.action = 'agent.seeded'
  );

COMMIT;
