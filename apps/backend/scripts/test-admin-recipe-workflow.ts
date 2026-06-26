import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import {
  archiveAdminRecipe,
  createAdminRecipe,
  publishAdminRecipe,
  restoreAdminRecipeVersion,
  submitAdminRecipeReview,
  updateAdminRecipe,
} from "../src/modules/recipes/admin-recipe.routes";

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const staff = await db.query<{ id: string }>(
    `INSERT INTO staff_users(clerk_user_id,email,name,role,is_active)
     VALUES($1,$2,$3,'admin',true) RETURNING id::text`,
    [`recipe-admin-${suffix}`, `recipe-${suffix}@example.com`, "Recipe Admin Test"],
  );
  const identity: StaffIdentity = {
    kind: "staff",
    clerkUserId: `recipe-admin-${suffix}`,
    staffId: staff.rows[0].id,
    role: "admin",
    isActive: true,
  };
  let recipeId: string | null = null;

  try {
    const created = await createAdminRecipe(identity, {
      slug: `recipe-admin-${suffix}`,
      title: "Trà đào kiểm thử",
      shortDescription: "Công thức integration test",
      aliases: ["Trà đào"],
      visibility: "public",
      difficulty: "easy",
      prepMinutes: 5,
      cookMinutes: 10,
      yieldQuantity: 10,
      yieldUnit: "portion",
      ingredients: [{ name: "Nước", quantity: 1000, unit: "ml", optional: false }],
      steps: [{ title: "Pha", instruction: "Pha đều nguyên liệu.", durationSeconds: 60 }],
      tagIds: [],
      categoryId: null,
    });
    recipeId = String(created.recipe.id);
    assert.equal(created.recipe.status, "draft");

    const updated = await updateAdminRecipe(identity, recipeId, { title: "Trà đào integration" });
    assert.equal(updated.recipe.title, "Trà đào integration");

    const reviewed = await submitAdminRecipeReview(identity, recipeId);
    assert.equal(reviewed.recipe.status, "in_review");
    assert.deepEqual(reviewed.findings.errors, []);

    const published = await publishAdminRecipe(identity, recipeId, "Initial publish");
    assert.equal(published.recipe.status, "published");
    assert.equal(published.versionNumber, 1);

    await assert.rejects(
      () => updateAdminRecipe(identity, recipeId as string, { title: "Illegal edit" }),
      (error: unknown) => error instanceof Error && error.message.includes("Restore recipe"),
    );

    const archived = await archiveAdminRecipe(identity, recipeId);
    assert.equal(archived.recipe.status, "archived");

    const restored = await restoreAdminRecipeVersion(identity, recipeId, 1);
    assert.equal(restored.recipe.status, "draft");
    assert.equal(restored.recipe.visibility, "internal");
    assert.equal(restored.restoredFromVersion, 1);

    const versions = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM recipe_versions WHERE recipe_id=$1::uuid`,
      [recipeId],
    );
    assert.equal(Number(versions.rows[0].count), 1);
    console.log("Admin recipe workflow integration passed.");
  } finally {
    if (recipeId) await db.query(`DELETE FROM recipes WHERE id=$1::uuid`, [recipeId]);
    await db.query(`DELETE FROM staff_users WHERE id=$1::uuid`, [identity.staffId]);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
