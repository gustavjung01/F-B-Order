import { assert, clean, parseJson, unique } from "./parent-map-io.mjs";

export function finalizeParentMap(state) {
  const { products, variants: sourceVariants, parentByKey, members, productByKey, variantBySku, variantByProduct } = state;
  const membersByParent = new Map();
  for (const member of members) {
    const source = variantBySku.get(member.sku);
    assert(source, `Unknown member SKU ${member.sku}.`);
    assert(source.product_key === member.product_key, `SKU/product mismatch for ${member.sku}.`);
    assert(productByKey.has(member.product_key), `Unknown product ${member.product_key}.`);
    assert(parentByKey.has(member.parent_key), `Missing parent ${member.parent_key}.`);
    if (!membersByParent.has(member.parent_key)) membersByParent.set(member.parent_key, []);
    membersByParent.get(member.parent_key).push(member);
  }

  for (const [parentKey, parent] of [...parentByKey]) {
    const rows = membersByParent.get(parentKey) || [];
    if (!rows.length) {
      parentByKey.delete(parentKey);
      continue;
    }
    const groups = parseJson(parent.option_groups_json, []);
    assert(rows.length > 1, `Explicit parent ${parentKey} has one variant.`);
    assert(groups.length > 0, `Parent ${parentKey} has no option groups.`);
    const signatures = rows.map((row) => {
      const options = parseJson(row.options_json);
      assert(groups.every((key) => clean(options[key])), `Variant ${row.sku} misses an option in ${parentKey}.`);
      return groups.map((key) => clean(options[key])).join("|");
    });
    assert(unique(signatures).length === signatures.length, `Duplicate option signature in ${parentKey}.`);
    for (const key of groups) {
      const values = unique(rows.map((row) => clean(parseJson(row.options_json)[key])));
      assert(values.length > 1, `Option ${key} does not vary in ${parentKey}.`);
    }
  }

  const grouped = new Set(members.map((row) => row.product_key));
  const explicitParents = [...parentByKey.values()];
  const singletonParents = products.filter((row) => !grouped.has(row.product_key)).map((row) => ({
    parent_key: row.product_key,
    name: row.name,
    brand: row.brand || "",
    cover_image_key: row.image_key,
    confidence: "source",
    option_groups_json: "[]",
  }));
  const parents = [...explicitParents, ...singletonParents];
  const memberByProduct = new Map(members.map((row) => [row.product_key, row]));
  const variants = products.map((product, index) => {
    const source = variantByProduct.get(product.product_key);
    const member = memberByProduct.get(product.product_key);
    const price = Number(product.price_from);
    assert(source, `Product ${product.product_key} has no variant.`);
    return {
      product_key: product.product_key,
      sku: source.sku,
      parent_key: member?.parent_key || product.product_key,
      variant_key: member?.variant_key || source.variant_key,
      options_json: member?.options_json || source.options_json || "{}",
      source_row: member?.source_row || String(index + 2),
      source_group: product.category,
      raw_name: product.name,
      price_khtt_nghin: Number.isFinite(price) ? String(price / 1000) : "",
      image_key: product.image_key,
      image_status: String(product.status).includes("missing_image") ? "MISSING" : "MAPPED",
    };
  });

  assert(unique(parents.map((row) => row.parent_key)).length === parents.length, "Duplicate final parent_key.");
  assert(unique(variants.map((row) => row.sku)).length === sourceVariants.length, "Duplicate final SKU.");
  assert(unique(variants.map((row) => row.variant_key)).length === sourceVariants.length, "Duplicate final variant_key.");
  const parentKeys = new Set(parents.map((row) => row.parent_key));
  assert(variants.every((row) => parentKeys.has(row.parent_key)), "Orphan final variant.");
  return { parents, variants, explicitParents, singletonParents, grouped };
}
