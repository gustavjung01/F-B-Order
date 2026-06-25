import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { getDb } from "../src/db/pool";
import {
  catalogChoiceGroupsForSku,
  parseCatalogChoiceGroups,
  validateCatalogSelections,
} from "../src/modules/catalog-v2/catalog-v2-choices";

async function main() {
  const db = getDb();
  const products = await db.query<{
    product_key: string;
    name: string;
    brand: string | null;
    catalog_group_key: string | null;
    choice_groups: unknown;
  }>(`SELECT product_key, name, brand, catalog_group_key, choice_groups
      FROM catalog_products
      WHERE product_key IN ('siro-mama-gold', 'sinh-to-berrino')`);

  const goldenFarm = products.rows.find((row) => row.product_key === "siro-mama-gold");
  const smoothie = products.rows.find((row) => row.product_key === "sinh-to-berrino");
  assert.equal(goldenFarm?.name, "Siro Golden Farm");
  assert.equal(goldenFarm?.brand, "Golden Farm");
  assert.equal(goldenFarm?.catalog_group_key, "siro");
  assert.ok(Array.isArray(goldenFarm?.choice_groups) && goldenFarm.choice_groups.length === 1);
  assert.equal(smoothie?.catalog_group_key, "sinh-to");
  assert.deepEqual(smoothie?.choice_groups, []);

  const retired = await db.query<{ sku: string; is_active: boolean; is_public: boolean }>(
    `SELECT sku, is_active, is_public FROM catalog_variants WHERE sku IN ('BGKQ-0007','BGKQ-0009') ORDER BY sku`,
  );
  assert.equal(retired.rows.length, 2);
  assert.ok(retired.rows.every((row) => !row.is_active && !row.is_public));

  const indexResult = await db.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE indexname='cart_items_cart_variant_selection_unique'`,
  );
  assert.match(indexResult.rows[0]?.indexdef || "", /cart_id, variant_id, selection_key/);

  const flavorGroup = [{ key: "flavor", name: "Vị", required: true, values: ["Dâu", "Vải"] }];
  const strawberry = validateCatalogSelections({ flavor: "Dâu" }, flavorGroup);
  const lychee = validateCatalogSelections({ flavor: "Vải" }, flavorGroup);
  assert.notEqual(strawberry.selectionKey, lychee.selectionKey);
  assert.throws(() => validateCatalogSelections({}, flavorGroup), /required/i);

  const scopedGroups = parseCatalogChoiceGroups([{
    key: "flavor",
    name: "Vị",
    required: true,
    values: ["Dâu", "Đào", "Đường đen"],
    valuesBySku: {
      "BGKQ-A": ["Dâu", "Đường đen"],
      "BGKQ-B": ["Đào"],
    },
  }]);
  const skuAChoices = catalogChoiceGroupsForSku(scopedGroups, "BGKQ-A");
  const skuBChoices = catalogChoiceGroupsForSku(scopedGroups, "BGKQ-B");
  assert.deepEqual(skuAChoices[0].values, ["Dâu", "Đường đen"]);
  assert.deepEqual(skuBChoices[0].values, ["Đào"]);
  assert.throws(() => validateCatalogSelections({ flavor: "Đào" }, skuAChoices), /Invalid Vị/);
  assert.equal(validateCatalogSelections({ flavor: "Đào" }, skuBChoices).selectionKey, "flavor=%C4%90%C3%A0o");

  const app = createApp({ port: 0, serviceName: "tea-syrup-contract", corsOrigin: "http://localhost:3000" });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const listResponse = await fetch(`${baseUrl}/catalog/products?industry=nguyen-lieu-tra-sua&group=siro&limit=100`);
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json() as {
      products: Array<{ productKey: string; catalogGroupKey: string }>;
      facets: { groups: Array<{ id: string; name: string }> };
    };
    assert.ok(list.products.length > 0);
    assert.ok(list.products.every((product) => product.catalogGroupKey === "siro"));
    assert.ok(list.facets.groups.some((group) => group.id === "siro" && group.name === "Siro"));

    const goldenFarmVariants = await db.query<{ id: string; sku: string }>(
      `SELECT variant.id::text AS id, variant.sku FROM catalog_variants variant
       JOIN catalog_products product ON product.id=variant.product_id
       WHERE product.product_key='siro-mama-gold' AND variant.is_active
       ORDER BY variant.sort_order`,
    );
    assert.equal(goldenFarmVariants.rows.length, 2);
    const goldenFarmDetailResponse = await fetch(`${baseUrl}/catalog/products/${goldenFarmVariants.rows[0].id}`);
    assert.equal(goldenFarmDetailResponse.status, 200);
    const goldenFarmDetail = await goldenFarmDetailResponse.json() as {
      product: { name: string; brand: string };
      optionGroups: Array<{ key: string; values: string[] }>;
      choiceGroups: Array<{ key: string; values: string[]; valuesBySku?: Record<string, string[]> }>;
      variants: Array<{ sku: string; price: number | null; options: Record<string, string> }>;
    };
    assert.equal(goldenFarmDetail.product.name, "Siro Golden Farm");
    assert.equal(goldenFarmDetail.product.brand, "Golden Farm");
    assert.ok(goldenFarmDetail.optionGroups.some((group) => group.key === "size" && group.values.length === 2));
    const flavor = goldenFarmDetail.choiceGroups.find((group) => group.key === "flavor");
    assert.equal(flavor?.valuesBySku?.["BGKQ-0004"].length, 12);
    assert.equal(flavor?.valuesBySku?.["BGKQ-0005"].length, 16);
    assert.equal(new Set(goldenFarmDetail.variants.map((variant) => variant.price)).size, 2);

    const smoothieVariant = await db.query<{ id: string }>(
      `SELECT variant.id::text AS id FROM catalog_variants variant
       JOIN catalog_products product ON product.id=variant.product_id
       WHERE product.product_key='sinh-to-berrino' AND variant.is_active
       ORDER BY variant.sort_order LIMIT 1`,
    );
    const smoothieDetailResponse = await fetch(`${baseUrl}/catalog/products/${smoothieVariant.rows[0].id}`);
    assert.equal(smoothieDetailResponse.status, 200);
    const smoothieDetail = await smoothieDetailResponse.json() as {
      optionGroups: Array<{ key: string; values: string[] }>;
      choiceGroups: Array<unknown>;
      variants: Array<unknown>;
    };
    assert.equal(smoothieDetail.choiceGroups.length, 0);
    assert.ok(smoothieDetail.optionGroups.some((group) => group.key === "flavor" && group.values.length > 1));
    assert.ok(smoothieDetail.variants.length > 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.end();
  }

  console.log("Tea group and syrup size/flavor contract passed.");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
