import { assert, parseJson, unique } from "./parent-map-io.mjs";

export function applyParentFixes(input) {
  const { products, variants, parents, members: sourceMembers, fixes } = input;
  assert(products.length === 275, `Expected 275 source products, found ${products.length}.`);
  assert(variants.length === 275, `Expected 275 source variants, found ${variants.length}.`);
  assert(unique(products.map((row) => row.product_key)).length === products.length, "Duplicate source product_key.");
  assert(unique(variants.map((row) => row.sku)).length === variants.length, "Duplicate source SKU.");
  assert(unique(variants.map((row) => row.variant_key)).length === variants.length, "Duplicate source variant_key.");

  const productByKey = new Map(products.map((row) => [row.product_key, row]));
  const variantBySku = new Map(variants.map((row) => [row.sku, row]));
  const variantByProduct = new Map(variants.map((row) => [row.product_key, row]));
  const removed = new Set(fixes.removeParentKeys || []);
  const ungrouped = new Set(fixes.ungroupProductKeys || []);
  const groups = Array.isArray(fixes.groups) ? fixes.groups : [];
  const overrideSkus = new Set(groups.flatMap((group) => group.members.map((member) => member.sku)));
  const parentByKey = new Map(
    parents.filter((row) => !removed.has(row.parent_key)).map((row) => [row.parent_key, { ...row }]),
  );
  const members = sourceMembers
    .filter((row) => !removed.has(row.parent_key))
    .filter((row) => !ungrouped.has(row.product_key))
    .filter((row) => !overrideSkus.has(row.sku))
    .map((row) => ({ ...row }));

  for (const group of groups) {
    assert(group.parentKey && group.name && group.coverImageKey, "Invalid parent override metadata.");
    assert(Array.isArray(group.optionGroups) && group.optionGroups.length, `Parent ${group.parentKey} has no option groups.`);
    assert(Array.isArray(group.members) && group.members.length > 1, `Parent ${group.parentKey} needs multiple variants.`);
    parentByKey.set(group.parentKey, {
      parent_key: group.parentKey,
      name: group.name,
      brand: group.brand || "",
      cover_image_key: group.coverImageKey,
      confidence: "high",
      option_groups_json: JSON.stringify(group.optionGroups),
    });
    for (const member of group.members) {
      const source = variantBySku.get(member.sku);
      assert(source, `Unknown override SKU ${member.sku}.`);
      members.push({
        product_key: source.product_key,
        sku: member.sku,
        parent_key: group.parentKey,
        variant_key: member.variantKey,
        options_json: JSON.stringify(member.options || {}),
        source_row: "",
      });
    }
  }

  for (const [sku, fix] of Object.entries(fixes.memberFixes || {})) {
    const member = members.find((row) => row.sku === sku);
    assert(member, `Cannot apply member fix for ${sku}.`);
    member.parent_key = fix.parentKey || member.parent_key;
    member.variant_key = fix.variantKey || member.variant_key;
    member.options_json = JSON.stringify(fix.options || parseJson(member.options_json));
  }

  assert(unique(members.map((row) => row.sku)).length === members.length, "A SKU belongs to multiple parents.");
  assert(unique(members.map((row) => row.product_key)).length === members.length, "A product belongs to multiple parents.");
  return { products, variants, parentByKey, members, productByKey, variantBySku, variantByProduct };
}
