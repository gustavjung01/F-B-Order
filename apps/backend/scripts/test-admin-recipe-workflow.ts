import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import {
  archiveAdminRecipe,
  createAdminRecipe,
  listAdminRecipeVersions,
  publishRecipe,
  reviewRecipe,
  submitRecipeForReview,
  updateAdminRecipe,
} from "../src/modules/recipes/recipe-admin.service";

async function expectErrorCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
  });
}

async function main() {
  const db = getDb();
  const suffix = randomUUID().replaceAll("-", "");
  const clerkUserId = `recipe-workflow-${suffix}`;
  let staffId: string | null = null;
  let recipeId: string | null = null;
  let catalogProductId: string | null = null;
  let catalogVariantId: string | null = null;

  try {
    const product = await db.query<{ id: string }>(
      `INSERT INTO catalog_products (
         catalog_version,
         product_key,
         name,
         brand,
         industry,
         industry_key,
         subcategory,
         source_group,
         option_groups,
         status,
         sort_order,
         catalog_group_key
       ) VALUES (
         'hung-phat-v2',
         $1,
         'Trà fixture cho Recipe workflow',
         'Bếp Sỉ',
         'Nguyên liệu trà sữa',
         'nguyen-lieu-tra-sua',
         'Trà',
         'recipe-workflow-test',
         '{}'::jsonb,
         'active',
         999999,
         'tra'
       )
       RETURNING id::text`,
      [`recipe-workflow-product-${suffix}`],
    );
    catalogProductId = product.rows[0].id;

    const variant = await db.query<{ id: string }>(
      `INSERT INTO catalog_variants (
         product_id,
         catalog_version,
         variant_key,
         sku,
         name,
         options,
         price_mode,
         price_label,
         retail_price,
         shop_price,
         status,
         is_active,
         is_public,
         is_orderable,
         sort_order
       ) VALUES (
         $1::uuid,
         'hung-phat-v2',
         $2,
         $3,
         'Gói kiểm thử 1kg',
         '{"size":"1kg","sell_unit":"gói"}'::jsonb,
         'fixed',
         NULL,
         NULL,
         100000,
         'active',
         true,
         true,
         true,
         999999
       )
       RETURNING id::text`,
      [catalogProductId, `recipe-workflow-variant-${suffix}`, `RWF-${suffix.slice(0, 20)}`],
    );
    catalogVariantId = variant.rows[0].id;

    const staff = await db.query<{ id: string }>(
      `INSERT INTO staff_users (clerk_user_id, email, name, role, is_active)
       VALUES ($1, $2, $3, 'admin', true)
       RETURNING id::text`,
      [clerkUserId, `recipe-workflow-${suffix}@example.com`, "Recipe Workflow Test"],
    );
    staffId = staff.rows[0].id;

    const identity: StaffIdentity = {
      kind: "staff",
      clerkUserId,
      staffId,
      role: "admin",
      isActive: true,
    };

    const baseDocument = {
      slug: `recipe-workflow-${suffix}`,
      title: "Trà đào kiểm thử workflow",
      shortDescription: "Công thức dùng để khóa state machine Recipe.",
      description: "Bản integration test không được tồn tại sau khi chạy.",
      relatedBrand: "Bếp Sỉ",
      coverImageUrl: "https://example.com/recipe-cover.jpg",
      yieldQuantity: 10,
      yieldUnit: "ly",
      sortOrder: 17,
      changeNote: "Tạo bản nháp đầu tiên",
      ingredients: [
        {
          catalogVariantId,
          quantity: 100,
          unit: "ml",
          optional: false,
          note: "Nguyên liệu catalog bắt buộc",
        },
      ],
      steps: [
        {
          title: "Pha nền",
          content: "Khuấy đều nguyên liệu đến khi đồng nhất.",
          imageUrl: "https://example.com/recipe-step.jpg",
        },
      ],
    };

    const created = await createAdminRecipe(identity, baseDocument, db);
    recipeId = String(created.recipe.id);
    assert.equal(created.recipe.status, "draft");
    assert.equal(created.recipe.workflowStatus, "draft");
    assert.equal(created.recipe.currentVersionNo, 1);
    assert.equal(created.recipe.coverImageUrl, baseDocument.coverImageUrl);
    assert.equal(created.recipe.sortOrder, 17);
    assert.equal(created.recipe.ingredients.length, 1);
    assert.equal(created.recipe.ingredients[0]?.catalogVariantId, catalogVariantId);
    assert.equal(created.recipe.steps[0]?.imageUrl, baseDocument.steps[0].imageUrl);

    const updated = await updateAdminRecipe(
      identity,
      recipeId,
      {
        ...baseDocument,
        title: "Trà đào workflow bản chỉnh sửa",
        changeNote: "Chỉnh trước khi gửi duyệt",
      },
      db,
    );
    assert.equal(updated.recipe.currentVersionNo, 2);
    assert.equal(updated.recipe.workflowStatus, "draft");

    await expectErrorCode(() => publishRecipe(identity, recipeId as string, db), "RECIPE_NOT_APPROVED");

    const submitted = await submitRecipeForReview(identity, recipeId, db);
    assert.equal(submitted.recipe.status, "needs_review");
    assert.equal(submitted.recipe.workflowStatus, "in_review");

    await expectErrorCode(
      () => updateAdminRecipe(identity, recipeId as string, baseDocument, db),
      "RECIPE_REVIEW_LOCKED",
    );

    const changesRequested = await reviewRecipe(
      identity,
      recipeId,
      { decision: "changes_requested", note: "Cần làm rõ bước pha." },
      db,
    );
    assert.equal(changesRequested.recipe.status, "draft");
    assert.equal(changesRequested.recipe.workflowStatus, "changes_requested");
    assert.equal(changesRequested.recipe.reviewNote, "Cần làm rõ bước pha.");

    const revised = await updateAdminRecipe(
      identity,
      recipeId,
      {
        ...baseDocument,
        title: "Trà đào workflow đã sửa",
        steps: [
          {
            title: "Pha nền",
            content: "Khuấy đều trong 60 giây đến khi đồng nhất.",
            imageUrl: "https://example.com/recipe-step-revised.jpg",
          },
        ],
        changeNote: "Sửa theo yêu cầu review",
      },
      db,
    );
    assert.equal(revised.recipe.currentVersionNo, 3);
    assert.equal(revised.recipe.workflowStatus, "draft");

    await submitRecipeForReview(identity, recipeId, db);
    const approved = await reviewRecipe(
      identity,
      recipeId,
      { decision: "approved", note: "Đủ điều kiện xuất bản." },
      db,
    );
    assert.equal(approved.recipe.workflowStatus, "approved");

    const published = await publishRecipe(identity, recipeId, db);
    assert.equal(published.recipe.status, "active");
    assert.equal(published.recipe.workflowStatus, "published");
    assert.equal(published.recipe.currentVersionId, published.recipe.publishedVersionId);
    const publishedVersionId = String(published.recipe.publishedVersionId);

    const newDraft = await updateAdminRecipe(
      identity,
      recipeId,
      {
        ...baseDocument,
        title: "Trà đào workflow bản nháp sau publish",
        changeNote: "Tạo current draft mới nhưng giữ published snapshot",
      },
      db,
    );
    assert.equal(newDraft.recipe.status, "active");
    assert.equal(newDraft.recipe.workflowStatus, "draft");
    assert.notEqual(newDraft.recipe.currentVersionId, publishedVersionId);
    assert.equal(newDraft.recipe.publishedVersionId, publishedVersionId);

    const versions = await listAdminRecipeVersions(identity, recipeId, db);
    assert.equal(versions.versions.length, 4);
    assert.equal(versions.versions.filter((version: { isPublished: boolean }) => version.isPublished).length, 1);
    assert.equal(versions.versions[0]?.isCurrent, true);
    assert.equal(versions.versions[0]?.workflowStatus, "draft");

    const archived = await archiveAdminRecipe(identity, recipeId, db);
    assert.equal(archived.recipe.status, "inactive");
    await expectErrorCode(() => archiveAdminRecipe(identity, recipeId as string, db), "RECIPE_ALREADY_ARCHIVED");

    console.log("Admin recipe workflow integration passed.");
  } finally {
    if (recipeId) {
      await db.query("DELETE FROM recipes WHERE id = $1::uuid", [recipeId]).catch(() => undefined);
    }
    if (staffId) {
      await db.query("DELETE FROM staff_users WHERE id = $1::uuid", [staffId]).catch(() => undefined);
    }
    if (catalogVariantId) {
      await db.query("DELETE FROM catalog_variants WHERE id = $1::uuid", [catalogVariantId]).catch(() => undefined);
    }
    if (catalogProductId) {
      await db.query("DELETE FROM catalog_products WHERE id = $1::uuid", [catalogProductId]).catch(() => undefined);
    }
    await db.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
