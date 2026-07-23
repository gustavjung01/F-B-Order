"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { useAdminPermissions } from "../AdminPermissionProvider";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminDialog,
  AdminEmptyState,
  AdminField,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
  AdminTextarea,
} from "../ui/AdminUI";
import { AiRecipeDraftDiff } from "./AiRecipeDraftDiff";
import { AiRecipeRdDiff } from "./AiRecipeRdDiff";
import {
  aiRecipeDraftStatusLabel,
  aiRecipeDraftStatusTone,
  isRecipeRdDraftContent,
  isRecipeSopDraftContent,
  recipeDraftTaskLabel,
  type AiRecipeDraft,
  type RecipeDraftDisplayKind,
} from "./recipe-draft-types";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function draftKind(draft: AiRecipeDraft): RecipeDraftDisplayKind {
  if (isRecipeRdDraftContent(draft.content)) return "rd";
  return isRecipeSopDraftContent(draft.content) ? draft.content.task || "sop" : "sop";
}

export function AiRecipeDraftReviewQueue() {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const [drafts, setDrafts] = useState<AiRecipeDraft[]>([]);
  const [selected, setSelected] = useState<AiRecipeDraft | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canReviewSop = has("ai.approve") && has("recipes.review");
  const canReviewRd = has("ai.approve") && has("recipe.rd.review");
  const canReview = canReviewSop || canReviewRd;

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được token đăng nhập.");
    return value;
  }

  async function loadDrafts() {
    if (!canReview) return;
    const payload = await adminApiFetch<{ drafts: AiRecipeDraft[] }>(
      "/api/admin/ai/drafts/review-queue",
      await token(),
    );
    const visible = payload.drafts.filter((draft) => {
      if (isRecipeRdDraftContent(draft.content)) return canReviewRd;
      return canReviewSop;
    });
    setDrafts(visible);
    setSelected((current) => {
      if (!current) return null;
      return visible.find((draft) => draft.id === current.id) || null;
    });
  }

  useEffect(() => {
    if (!canReview) return;
    void loadDrafts().catch(() => undefined);
    const timer = window.setInterval(() => void loadDrafts().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
    // Permissions remain stable inside the admin shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReview, canReviewRd, canReviewSop]);

  async function review(decision: "approve" | "reject") {
    if (!selected || reviewNote.trim().length < 3) return;
    setBusy(true);
    setMessage("");
    try {
      const basePath = isRecipeRdDraftContent(selected.content)
        ? "/api/admin/recipe-rd/drafts"
        : "/api/admin/ai/drafts";
      const payload = await adminApiFetch<{ draft: AiRecipeDraft }>(
        `${basePath}/${selected.id}/${decision}`,
        await token(),
        { method: "POST", body: JSON.stringify({ note: reviewNote.trim() }) },
      );
      setSelected(payload.draft);
      setReviewNote("");
      setMessage(decision === "approve" ? "Đã duyệt bản nháp. Người tạo có thể áp dụng theo workflow được kiểm soát." : "Đã từ chối bản nháp.");
      await loadDrafts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xử lý được bản nháp.");
    } finally {
      setBusy(false);
    }
  }

  if (!canReview) return null;

  return (
    <>
      <AdminSurface>
        <AdminSurfaceHeader
          eyebrow="Human review"
          title="Đề xuất công thức chờ duyệt"
          description="Reviewer đối chiếu dữ liệu gốc, đề xuất, cost, ràng buộc và kế hoạch test trước khi duyệt hoặc từ chối. Bản nháp do chính reviewer tạo không xuất hiện trong hàng đợi."
          actions={<AdminButton size="sm" tone="secondary" onClick={() => void loadDrafts()}>Tải lại</AdminButton>}
        />
        <AdminSurfaceBody className="grid gap-3">
          {message ? <AdminAlert tone={message.startsWith("Đã") ? "success" : "danger"}>{message}</AdminAlert> : null}
          {drafts.length === 0 ? (
            <AdminEmptyState title="Không có đề xuất cần review" description="SOP, QC, định lượng hoặc phương án R&D mới sẽ xuất hiện sau khi trợ lý hoàn thành." />
          ) : drafts.map((draft) => (
            <article key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminBadge tone={aiRecipeDraftStatusTone(draft.status)}>{aiRecipeDraftStatusLabel[draft.status]}</AdminBadge>
                    <AdminBadge tone="info">{recipeDraftTaskLabel[draftKind(draft)]}</AdminBadge>
                    <AdminBadge tone="neutral">{draft.recipeTitle || "Công thức"}</AdminBadge>
                  </div>
                  <h3 className="mt-2 font-black text-slate-900">{draft.title}</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">Tạo bởi {draft.createdByName || "nhân viên"} · {formatDate(draft.createdAt)}</p>
                  {draft.reviewNote ? <p className="mt-2 text-sm font-medium text-slate-600">Nhận xét: {draft.reviewNote}</p> : null}
                </div>
                <AdminButton size="sm" tone="secondary" onClick={() => { setSelected(draft); setReviewNote(""); }}>Xem thay đổi</AdminButton>
              </div>
            </article>
          ))}
        </AdminSurfaceBody>
      </AdminSurface>

      <AdminDialog
        open={Boolean(selected)}
        size="xl"
        eyebrow="Duyệt đề xuất công thức"
        title={selected?.title || "Duyệt đề xuất"}
        description={selected ? `${selected.recipeTitle || "Công thức"} · ${recipeDraftTaskLabel[draftKind(selected)]} · ${aiRecipeDraftStatusLabel[selected.status]}` : undefined}
        closeDisabled={busy}
        onClose={() => { if (!busy) setSelected(null); }}
        footer={selected?.status === "draft" ? (
          <div className="flex flex-wrap justify-end gap-2">
            <AdminButton tone="secondary" disabled={busy} onClick={() => setSelected(null)}>Đóng</AdminButton>
            <AdminButton tone="danger" disabled={busy || reviewNote.trim().length < 3} onClick={() => void review("reject")}>Từ chối</AdminButton>
            <AdminButton tone="success" disabled={busy || reviewNote.trim().length < 3} onClick={() => void review("approve")}>Duyệt đề xuất</AdminButton>
          </div>
        ) : <div className="flex justify-end"><AdminButton tone="secondary" onClick={() => setSelected(null)}>Đóng</AdminButton></div>}
      >
        {selected ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <AdminBadge tone={aiRecipeDraftStatusTone(selected.status)}>{aiRecipeDraftStatusLabel[selected.status]}</AdminBadge>
              <AdminBadge tone="info">{recipeDraftTaskLabel[draftKind(selected)]}</AdminBadge>
              {selected.reviewedByName ? <AdminBadge tone="neutral">Đã review bởi {selected.reviewedByName}</AdminBadge> : null}
            </div>
            {isRecipeRdDraftContent(selected.content) ? (
              <AiRecipeRdDiff content={selected.content} />
            ) : isRecipeSopDraftContent(selected.content) ? (
              <AiRecipeDraftDiff content={selected.content} />
            ) : (
              <AdminAlert tone="danger" title="Bản nháp không hợp lệ">Không đọc được cấu trúc đề xuất để review.</AdminAlert>
            )}
            {selected.status === "draft" ? (
              <AdminField label="Nhận xét review" hint="Bắt buộc khi duyệt hoặc từ chối; tối thiểu 3 ký tự.">
                <AdminTextarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Nêu rõ lý do duyệt, dữ liệu đã đối chiếu hoặc điểm cần sửa." />
              </AdminField>
            ) : selected.reviewNote ? (
              <AdminAlert tone={selected.status === "rejected" ? "danger" : "info"} title="Nhận xét reviewer">{selected.reviewNote}</AdminAlert>
            ) : null}
          </div>
        ) : null}
      </AdminDialog>
    </>
  );
}
