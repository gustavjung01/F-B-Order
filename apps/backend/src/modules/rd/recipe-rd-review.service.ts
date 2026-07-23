import type { Pool } from "pg";
import { getDb } from "../../db/pool.js";
import { getAiDraft, reviewAiDraft, type AiRequestMeta } from "../ai/ai-draft.service.js";
import type { StaffIdentity } from "../auth/auth.identity.js";
import { OrderEngineError } from "../orders/order-errors.js";
import { readRecipeRdDraftContent } from "./recipe-rd-content.js";

export async function reviewRecipeRdDraft(
  identity: StaffIdentity,
  draftId: string,
  decision: "approved" | "rejected",
  note: string,
  meta: AiRequestMeta,
  db: Pool = getDb(),
) {
  const before = await getAiDraft(draftId, db);
  if (before.draft.draftType !== "recipe") {
    throw new OrderEngineError("RECIPE_RD_DRAFT_TYPE_INVALID", 400, "This draft is not a Recipe proposal.");
  }
  const content = readRecipeRdDraftContent(before.draft.content);
  const reviewed = await reviewAiDraft(identity, draftId, decision, note, meta, db);
  await db.query(
    `UPDATE recipe_rd_requests
     SET status=$2,reviewed_by_staff_id=$3,reviewed_at=now()
     WHERE id=$1 AND ai_draft_id=$4`,
    [content.rdRequestId, decision, identity.staffId, draftId],
  );
  return reviewed;
}
