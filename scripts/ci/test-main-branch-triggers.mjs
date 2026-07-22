import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const workflows = [
  ".github/workflows/core-order-contract.yml",
  ".github/workflows/catalog-boundary.yml",
  ".github/workflows/migration-ci.yml",
];

const expectedTrigger = [
  "on:",
  "  push:",
  "    branches:",
  "      - main",
  "  pull_request:",
  "    branches:",
  "      - main",
].join("\n");

for (const workflow of workflows) {
  const source = fs.readFileSync(path.join(repoRoot, workflow), "utf8");
  const match = source.match(/^name:[^\n]+\n\n([\s\S]*?)\n\n(?:permissions:|jobs:)/);
  assert.ok(match, `${workflow} must contain a top-level trigger block`);
  assert.equal(
    match[1],
    expectedTrigger,
    `${workflow} must run only for pushes to main and pull requests targeting main`,
  );
  assert.doesNotMatch(
    source,
    /agent\/\*\*|feature\/\*\*|feat\/\*\*|hotfix\/\*\*|refactor\/\*\*/,
    `${workflow} must not restore branch-pattern push triggers`,
  );
}

console.log("CI workflows are locked to push main and pull_request main.");
