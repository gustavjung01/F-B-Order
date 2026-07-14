import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../../apps/frontend/components/admin/AdminRecipeScalePanel.tsx", import.meta.url),
  "utf8",
);

for (const required of [
  "function chooseRecipe(nextRecipeId: string)",
  "setRecipeId(nextRecipeId)",
  "setResult(null)",
  "setTargetYieldQuantity(nextRecipe?.yieldQuantity || \"\")",
  "if (!nextRecipe?.publishedVersionId)",
  "setSource(\"current\")",
  "setSource(event.target.value as \"current\" | \"published\"); setResult(null);",
  "setTargetYieldQuantity(event.target.value); setResult(null);",
  "disabled={!selectedRecipe?.publishedVersionId}",
  "body: JSON.stringify({ source, targetYieldQuantity })",
]) {
  assert.ok(source.includes(required), `Admin Recipe Scale contract is missing: ${required}`);
}

assert.ok(
  source.includes('type ScaleResult = {') && source.includes('source: "current" | "published"'),
  "Scale result must identify the source version family.",
);
assert.ok(
  source.includes("result.recipe.sourceVersionNo"),
  "Scale UI must show the source version number used by the backend.",
);

console.log("Admin Recipe Scale frontend contract passed.");
