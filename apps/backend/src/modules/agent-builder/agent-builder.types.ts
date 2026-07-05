export const AGENT_AUDIENCES = ["admin", "customer", "internal"] as const;
export const AGENT_STATUSES = ["draft", "active", "paused", "archived"] as const;
export const AGENT_VERSION_STATUSES = ["draft", "active", "superseded", "archived"] as const;
export const RESOURCE_STATUSES = ["draft", "active", "inactive", "archived"] as const;

export type AgentAudience = (typeof AGENT_AUDIENCES)[number];
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentVersionStatus = (typeof AGENT_VERSION_STATUSES)[number];
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export type JsonObject = Record<string, unknown>;

export type CreateAgentInput = {
  agentKey: string;
  name: string;
  description: string | null;
  audience: AgentAudience;
};

export type CreateAgentVersionInput = {
  modelProfileKey: string;
  personaKey: string;
  policyProfileKey: string;
  systemInstructions: string;
  greeting: string | null;
  outputContract: JsonObject;
  maxToolCalls: number;
  maxContextItems: number;
  toolKeys: string[];
  knowledgeSourceKeys: string[];
};

export type RuntimeBlocker = {
  code: string;
  message: string;
  resourceKey?: string;
};
