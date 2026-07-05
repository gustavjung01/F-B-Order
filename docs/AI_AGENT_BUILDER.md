# Agent Builder bootstrap

## What this slice delivers

A database-backed control plane for configuring agents without storing provider secrets in the database:

- Agent definitions and immutable numbered versions.
- Model, persona, policy, tool and knowledge-source catalogs.
- Initial draft agent: `bepsi-culinary-expert`.
- An append-only change log.
- Admin-only APIs to inspect the catalog, create agents, create versions, inspect readiness and activate a version.

## Important boundary

This slice **does not invoke any LLM** and **does not execute any tool**. It intentionally seeds every business tool as `implementation_status = planned`, and the model profile as `status = draft`. The activation endpoint blocks until every referenced resource is ready. That means a configuration error cannot accidentally become a live AI endpoint.

## Database

Run the repository migration command:

```bash
pnpm db:migrate
```

Migration `011_ai_agent_builder.sql` creates these tables:

- `ai_model_profiles`
- `ai_personas`
- `ai_policy_profiles`
- `ai_tool_definitions`
- `ai_knowledge_sources`
- `ai_knowledge_documents`
- `ai_agent_definitions`
- `ai_agent_versions`
- `ai_agent_version_tools`
- `ai_agent_version_knowledge_sources`
- `ai_agent_change_logs`

## API

All routes require the existing Clerk-backed `admin` staff identity.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/admin/agent-builder/catalog` | Builder resource catalog and seeded data |
| `GET` | `/api/admin/agent-builder/agents` | Agent list |
| `POST` | `/api/admin/agent-builder/agents` | Create agent shell in draft |
| `GET` | `/api/admin/agent-builder/agents/:agentKey` | Full agent, versions, resources and audit log |
| `POST` | `/api/admin/agent-builder/agents/:agentKey/versions` | Create a new immutable draft version |
| `GET` | `/api/admin/agent-builder/agents/:agentKey/versions/:version/readiness` | Explain runtime blockers |
| `POST` | `/api/admin/agent-builder/agents/:agentKey/versions/:version/activate` | Activate only when every gate is ready |

## Example: create a version

```json
{
  "modelProfileKey": "vertex-agent-builder-default",
  "personaKey": "bepsi-culinary-expert-v1",
  "policyProfileKey": "bepsi-safe-actions-v1",
  "systemInstructions": "Your version-specific instructions here.",
  "greeting": "Xin chÃ o",
  "outputContract": {
    "required": ["answer", "assumptions", "nextBestAction"]
  },
  "maxToolCalls": 6,
  "maxContextItems": 12,
  "toolKeys": ["catalog.search-products", "recipe.get-approved"],
  "knowledgeSourceKeys": ["bepsi-agent-foundation", "bepsi-live-catalog"]
}
```

## Next implementation slice

A2 should implement the tool adapters behind the six seeded contracts, change their `implementation_status` to `ready` only after tests, then introduce the provider adapter. Activation remains intentionally blocked before that point.
