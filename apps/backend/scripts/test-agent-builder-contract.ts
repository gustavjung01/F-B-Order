import assert from "node:assert/strict";

import {
  normalizeAgentKey,
  normalizeVersionNumber,
  parseCreateAgentInput,
  parseCreateAgentVersionInput,
} from "../src/modules/agent-builder/agent-builder.validation";

assert.equal(normalizeAgentKey("bepsi-culinary-expert"), "bepsi-culinary-expert");
assert.equal(normalizeVersionNumber("12"), 12);
assert.throws(() => normalizeAgentKey("BepSi Agent"), /agentKey/);
assert.throws(() => normalizeVersionNumber(0), /version/);

assert.deepEqual(
  parseCreateAgentInput({
    agentKey: "ops-helper",
    name: "Ops Helper",
    description: "Internal assistant",
    audience: "internal",
  }),
  {
    agentKey: "ops-helper",
    name: "Ops Helper",
    description: "Internal assistant",
    audience: "internal",
  },
);

const version = parseCreateAgentVersionInput({
  modelProfileKey: "vertex-agent-builder-default",
  personaKey: "bepsi-culinary-expert-v1",
  policyProfileKey: "bepsi-safe-actions-v1",
  systemInstructions: "Answer with grounded operational advice.",
  outputContract: { required: ["answer"] },
  toolKeys: ["catalog.search-products"],
  knowledgeSourceKeys: ["bepsi-agent-foundation"],
});
assert.equal(version.maxToolCalls, 6);
assert.equal(version.maxContextItems, 12);
assert.deepEqual(version.toolKeys, ["catalog.search-products"]);
assert.throws(
  () =>
    parseCreateAgentVersionInput({
      modelProfileKey: "vertex-agent-builder-default",
      personaKey: "bepsi-culinary-expert-v1",
      policyProfileKey: "bepsi-safe-actions-v1",
      systemInstructions: "x",
      outputContract: {},
      toolKeys: ["catalog.search-products", "catalog.search-products"],
    }),
  /duplicate/,
);

console.log("Agent Builder contract checks passed.");
