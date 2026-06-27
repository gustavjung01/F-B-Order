import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/db/pool";
import type { StaffIdentity } from "../src/modules/auth/auth.identity";
import { AiDraftReviewService } from "../src/modules/ai/ai-draft-review.service";
import { AiProjectStoreError } from "../src/modules/ai/ai-project-store.service";

async function expectStoreError(run: () => Promise<unknown>, code: string) {
  await assert.rejects(
    run,
    (error: unknown) => error instanceof AiProjectStoreError && error.code === code,
    `Expected AiProjectStoreError ${code}`,
  );
}

async function main() {
  const db = getDb();
  const suffix = randomUUID().slice(0, 8);
  const service = new AiDraftReviewService(db);
  const admin: StaffIdentity = {
    kind: "staff",
    clerkUserId: `clerk-a1f-${suffix}`,
    staffId: randomUUID(),
    role: "admin",
    isActive: true,
  };
  const createdDocumentIds: string[] = [];

  await db.query(
    `INSERT INTO staff_users (id, clerk_user_id, name, role, is_active)
     VALUES ($1,$2,'A1f Admin','admin',true)`,
    [admin.staffId, admin.clerkUserId],
  );

  async function createDocument(source: "ai" | "manual", validationStatus: "valid" | "invalid") {
    const result = await db.query<{ id: string }>(
      `INSERT INTO ai_documents (
         source,status,schema_version,json_payload,validation_status,validation_errors,
         created_by_staff_id,updated_by_staff_id
       ) VALUES ($1,'draft','1.0',$2::jsonb,$3,$4::jsonb,$5,$5)
       RETURNING id`,
      [
        source,
        JSON.stringify({ title: `Draft ${source} ${validationStatus}`, yield: 20 }),
        validationStatus,
        JSON.stringify(validationStatus === "valid" ? [] : [{ code: "BAD_OUTPUT" }]),
        admin.staffId,
      ],
    );
    createdDocumentIds.push(result.rows[0].id);
    return result.rows[0].id;
  }

  try {
    const validAiDraftId = await createDocument("ai", "valid");
    const invalidAiDraftId = await createDocument("ai", "invalid");
    const manualDraftId = await createDocument("manual", "valid");

    const draftList = await service.listAiDrafts(admin, "draft");
    assert.ok(draftList.documents.some((document) => document.id === validAiDraftId));
    assert.ok(draftList.documents.some((document) => document.id === invalidAiDraftId));
    assert.ok(!draftList.documents.some((document) => document.id === manualDraftId));

    const detail = await service.getAiDraft(admin, validAiDraftId);
    assert.equal(detail.document.source, "ai");
    assert.equal(detail.document.status, "draft");
    assert.deepEqual(detail.reviewLogs, []);

    await expectStoreError(() => service.getAiDraft(admin, manualDraftId), "AI_DRAFT_NOT_FOUND");
    await expectStoreError(() => service.listAiDrafts(admin, "bad-status"), "INVALID_STATUS_FILTER");

    const approved = await service.reviewAiDraft(admin, validAiDraftId, {
      action: "approve",
      note: "Human approved for later apply step.",
    });
    assert.equal(approved.document.status, "approved");
    assert.equal(approved.document.applyStatus, "pending_apply");
    assert.equal(approved.document.reviewedByStaffId, admin.staffId);
    assert.equal(approved.document.reviewNote, "Human approved for later apply step.");
    assert.equal(approved.document.version, 2);
    assert.equal(approved.reviewLog.fromStatus, "draft");
    assert.equal(approved.reviewLog.toStatus, "approved");

    const approvedDetail = await service.getAiDraft(admin, validAiDraftId);
    assert.equal(approvedDetail.reviewLogs.length, 1);
    assert.equal(approvedDetail.reviewLogs[0].toStatus, "approved");
    assert.equal(approvedDetail.reviewLogs[0].note, "Human approved for later apply step.");

    await expectStoreError(
      () => service.reviewAiDraft(admin, validAiDraftId, { action: "approve" }),
      "AI_DRAFT_ALREADY_REVIEWED",
    );

    await expectStoreError(
      () => service.reviewAiDraft(admin, invalidAiDraftId, { action: "approve" }),
      "AI_DRAFT_INVALID",
    );
    const rejected = await service.reviewAiDraft(admin, invalidAiDraftId, {
      action: "reject",
      note: "Invalid output rejected.",
    });
    assert.equal(rejected.document.status, "rejected");
    assert.equal(rejected.document.applyStatus, "not_applicable");

    const approvedList = await service.listAiDrafts(admin, "approved");
    assert.ok(approvedList.documents.some((document) => document.id === validAiDraftId));
    const rejectedList = await service.listAiDrafts(admin, "rejected");
    assert.ok(rejectedList.documents.some((document) => document.id === invalidAiDraftId));
    const allList = await service.listAiDrafts(admin, "all");
    assert.ok(allList.documents.some((document) => document.id === validAiDraftId));
    assert.ok(allList.documents.some((document) => document.id === invalidAiDraftId));

    console.log("AI A1f draft review integration passed.");
  } finally {
    if (createdDocumentIds.length > 0) {
      await db.query("DELETE FROM ai_documents WHERE id = ANY($1::uuid[])", [createdDocumentIds]).catch(() => undefined);
    }
    await db.query("DELETE FROM staff_users WHERE id=$1", [admin.staffId]).catch(() => undefined);
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
