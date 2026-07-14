import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../../apps/frontend/components/admin/AdminRecipesPanel.tsx", import.meta.url),
  "utf8",
);

for (const required of [
  "clientId: string",
  "createClientId(\"ingredient\")",
  "createClientId(\"step\")",
  "key={item.clientId}",
  "catalogQueries[item.clientId]",
  "searchCatalog(item.clientId)",
  "removeIngredient(item.clientId)",
  "removeStep(item.clientId)",
  "Ảnh bìa công thức",
  "form.coverImageUrl",
  "Thứ tự hiển thị",
  "form.sortOrder",
  "Ảnh minh họa bước",
  "item.imageUrl",
]) {
  assert.ok(source.includes(required), `Admin Recipe editor contract is missing: ${required}`);
}

assert.equal(
  /form\.(ingredients|steps)\.map\([\s\S]{0,300}?key=\{index\}/.test(source),
  false,
  "Recipe ingredient and step rows must not use array indexes as React keys.",
);
assert.ok(
  source.includes("Record<string, string>") && source.includes("Record<string, CatalogOption[]>") && source.includes("catalogLoadingId"),
  "Catalog search state must be keyed by stable client IDs.",
);
assert.ok(
  source.includes("steps: form.steps") && source.includes("imageUrl: item.imageUrl"),
  "Step image URL must be preserved in the API payload.",
);

console.log("Admin Recipe editor contract passed.");
