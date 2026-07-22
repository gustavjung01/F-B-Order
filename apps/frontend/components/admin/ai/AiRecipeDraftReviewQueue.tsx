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
import {
  aiRecipeDraftStatusLabel,
  aiRecipeDraftStatusTone,
  isRecipeSopDraftContent,
  type AiRecipeDraft,
} from "./recipe-draft-types";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export function AiRecipeDraftReviewQueue() {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const [drafts, setDrafts] = useState<AiRecipeDraft[]>([]);
  const [selected, setSelected] = useState<AiRecipeDraft | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const canReview = has("ai.approve") && has("recipes.review");

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
    setDrafts(payload.drafts);
    setSelected((current) => {
      if (!current) return null;
      return payload.drafts.find((draft) => draft.id === current.id) || null;
    });
  }

  useEffect(() => {
    if (!canReview) return;
    void loadDrafts().catch(() => undefined);
    const timer = window.setInterval(() => void loadDrafts().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
    // Permissions remain stable inside the admin shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReview]);

  async function review(decision: "approve" | "reject") {
    if (!selected || reviewNote.trim().length < 3) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = await adminApiFetch<{ draft: AiRecipeDraft }>(
        `/api/admin/ai/drafts/${selected.id}/${decision}`,
        await token(),
        { method: "POST", body: JSON.stringify({ note: reviewNote.trim() }) },
      );
      setSelected(payload.draft);
      setReviewNote("");
      setMessage(decision === "approve" ? "Đã duyệt AI draft. Người tạo có thể chọn từng phần để áp dụng." : "Đã từ chối AI draft.");
      await loadDrafts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không xử lý được AI draft.");
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
          title="AI Recipe drafts chờ duyệt"
          description="Reviewer xem diff với version gốc trước khi duyệt hoặc từ chối. Draft do chính reviewer tạo không xuất hiện trong hàng đợi."
          actions={<AdminButton size="sm" tone="secondary" onClick={() => void loadDrafts()}>Tải lại</AdminButton>}
        />
        <AdminSurfaceBody className="grid gap-3">
          {message ? <AdminAlert tone={message.startsWith("Đã") ? "success" : "danger"}>{message}</AdminAlert> : null}
          {drafts.length === 0 ? (
            <AdminEmptyState title="Không có Recipe draft cần review" description="Draft mới sẽ xuất hiện sau khi worker hoàn thành AI job." />
          ) : drafts.map((draft) => (
            <article key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminBadge tone={aiRecipeDraftStatusTone(draft.status)}>{aiRecipeDraftStatusLabel[draft.status]}</AdminBadge>
                    <AdminBadge tone="neutral">{draft.recipeTitle || "Recipe"}</AdminBadge>
                  </div>
                  <h3 className="mt-2 font-black text-slate-900">{draft.title}</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">Tạo bởi {draft.createdByName || draft.createdByStaffId.slice(0, 8)} · {formatDate(draft.createdAt)}</p>
                  {draft.reviewNote ? <p className="mt-2 text-sm font-medium text-slate-600">Nhận xét: {draft.reviewNote}</p> : null}
                </div>
                <AdminButton size="sm" tone="secondary" onClick={() => { setSelected(draft); setReviewNote(""); }}>Xem diff</AdminButton>
              </div>
            </article>
          ))}
        </AdminSurfaceBody>
      </AdminSurface>

      <AdminDialog
        open={Boolean(selected)}
        size="xl"
        eyebrow="AI Recipe draft review"
        title={selected?.title || "Review AI draft"}
        description={selected ? `${selected.recipeTitle || "Recipe"} · ${aiRecipeDraftStatusLabel[selected.status]}` : undefined}
        closeDisabled={busy}
        onClose={() => { if (!busy) setSelected(null); }}
        footer={selected?.status === "draft" ? (
          <div className="flex flex-wrap justify-end gap-2">
            <AdminButton tone="secondary" disabled={busy} onClick={() => setSelected(null)}>Đóng</AdminButton>
            <AdminButton tone="danger" disabled={busy || reviewNote.trim().length < 3} onClick={() => void review("reject")}>Từ chối</AdminButton>
            <AdminButton tone="success" disabled={busy || reviewNote.trim().length < 3} onClick={() => void review("approve")}>Duyệt draft</AdminButton>
          </div>
        ) : <div className="flex justify-end"><AdminButton tone="secondary" onClick={() => setSelected(null)}>Đóng</AdminButton></div>}
      >
        {selected ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <AdminBadge tone={aiRecipeDraftStatusTone(selected.status)}>{aiRecipeDraftStatusLabel[selected.status]}</AdminBadge>
              <AdminBadge tone="neutral">Base version {selected.baseRecipeVersionId?.slice(0, 8) || "-"}</AdminBadge>
              {selected.reviewedByName ? <AdminBadge tone="info">Reviewer: {selected.reviewedByName}</AdminBadge> : null}
            </div>
            {isRecipeSopDraftContent(selected.content) ? (
              <AiRecipeDraftDiff content={selected.content} />
            ) : (
              <AdminAlert tone="danger" title="Draft không hợp lệ">Không đọc được cấu trúc SOP để review.</AdminAlert>
            )}
            {selected.status === "draft" ? (
              <AdminField label="Nhận xét review" hint="Bắt buộc khi duyệt hoặc từ chối; tối thiểu 3 ký tự.">
                <AdminTextarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Nêu rõ lý do duyệt hoặc điểm cần sửa." />
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
