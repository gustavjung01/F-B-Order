"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminApiError, adminApiFetch } from "@/lib/admin-api";

type AiDraftDocument = {
  id: string;
  status: string;
  applyStatus: string;
  validationStatus: string;
  jsonPayload: unknown;
  updatedAt: string;
  agent: { key: string; name: string | null; useCase: string | null } | null;
  model: { key: string; displayName: string | null } | null;
};

type AiDraftDetail = {
  document: AiDraftDocument;
  reviewLogs: Array<{ id: string; toStatus: string; note: string | null; createdAt: string }>;
};

type RecipeDraftResult = {
  recipe: {
    id: string;
    slug: string;
    title: string;
    status: string;
    createdAt: string;
  };
  document: {
    id: string;
    applyStatus: string;
    appliedAt: string;
    version: number;
  };
  counts: {
    ingredients: number;
    steps: number;
  };
};

function errorText(error: unknown) {
  if (error instanceof AdminApiError) return `${error.message} (${error.code})`;
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function AiRecipeDraftApplier() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [documents, setDocuments] = useState<AiDraftDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [detail, setDetail] = useState<AiDraftDetail | null>(null);
  const [result, setResult] = useState<RecipeDraftResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const token = useCallback(async () => {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được Clerk token.");
    return value;
  }, [getToken]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = await token();
      const response = await adminApiFetch<{ documents: AiDraftDocument[] }>(
        "/api/admin/ai-store/documents/ai-drafts?status=approved",
        authToken,
      );
      const recipeDocuments = response.documents.filter(
        (document) => document.agent?.useCase === "recipe_draft",
      );
      setDocuments(recipeDocuments);
      if (!selectedDocumentId && recipeDocuments[0]) setSelectedDocumentId(recipeDocuments[0].id);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [selectedDocumentId, token]);

  const loadDetail = useCallback(async (documentId: string) => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const authToken = await token();
      const response = await adminApiFetch<AiDraftDetail>(
        `/api/admin/ai-store/documents/ai-drafts/${documentId}`,
        authToken,
      );
      setDetail(response);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const createRecipeDraft = useCallback(async () => {
    if (!detail) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    setResult(null);
    try {
      const authToken = await token();
      const response = await adminApiFetch<RecipeDraftResult>(
        `/api/admin/ai-store/documents/ai-drafts/${detail.document.id}/recipe`,
        authToken,
        { method: "POST" },
      );
      setResult(response);
      setMessage(`Đã tạo recipe draft ${response.recipe.title}.`);
      await loadDocuments();
      await loadDetail(detail.document.id);
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setLoading(false);
    }
  }, [detail, loadDetail, loadDocuments, token]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadDocuments();
  }, [isLoaded, isSignedIn, loadDocuments]);

  useEffect(() => {
    if (selectedDocumentId) void loadDetail(selectedDocumentId);
  }, [loadDetail, selectedDocumentId]);

  const selectedDocument = detail?.document || null;
  const canCreateRecipeDraft = useMemo(() => Boolean(
    selectedDocument
      && selectedDocument.status === "approved"
      && selectedDocument.applyStatus === "pending_apply"
      && selectedDocument.validationStatus === "valid"
      && selectedDocument.agent?.useCase === "recipe_draft",
  ), [selectedDocument]);

  if (!isLoaded) return <main className="min-h-screen p-8">Đang tải phiên đăng nhập…</main>;
  if (!isSignedIn) return <main className="min-h-screen p-8">Bạn cần đăng nhập để mở trang này.</main>;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:px-8">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Bếp Sỉ AI</p>
            <h1 className="text-2xl font-bold">Approved Recipe Drafts</h1>
            <p className="mt-1 text-sm text-slate-500">Tạo recipe draft từ AI draft đã được human-approved.</p>
          </div>
          <div className="flex items-center gap-3">
            <a className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/admin/ai-workspace">AI Workspace</a>
            <a className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/admin">Admin</a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-6 md:px-8 xl:grid-cols-[430px_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Approved AI drafts</h2>
              <p className="mt-1 text-sm text-slate-500">Chỉ hiển thị use case recipe_draft.</p>
            </div>
            <button className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200" disabled={loading} onClick={() => void loadDocuments()}>
              Làm mới
            </button>
          </div>

          <div className="mt-5 max-h-[72vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
            {documents.length === 0 ? <p className="p-4 text-sm text-slate-500">Không có approved recipe draft.</p> : null}
            {documents.map((document) => (
              <button
                key={document.id}
                className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${selectedDocumentId === document.id ? "bg-indigo-50" : ""}`}
                onClick={() => setSelectedDocumentId(document.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{document.agent?.name || document.agent?.key || "Recipe draft"}</p>
                    <p className="mt-1 text-xs text-slate-500">{document.id}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{document.applyStatus}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">Updated {formatDate(document.updatedAt)}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          {error ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
          {message ? <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}

          {!selectedDocument ? <p className="text-sm text-slate-500">Chọn một approved recipe draft.</p> : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{selectedDocument.agent?.name || selectedDocument.agent?.key || "Recipe draft"}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedDocument.id}</p>
                </div>
                <button className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={loading || !canCreateRecipeDraft} onClick={() => void createRecipeDraft()}>
                  Tạo recipe draft
                </button>
              </div>

              <div className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                <p className="rounded-xl bg-slate-50 p-3"><b>Status:</b> {selectedDocument.status}</p>
                <p className="rounded-xl bg-slate-50 p-3"><b>Apply:</b> {selectedDocument.applyStatus}</p>
                <p className="rounded-xl bg-slate-50 p-3"><b>Validation:</b> {selectedDocument.validationStatus}</p>
                <p className="rounded-xl bg-slate-50 p-3"><b>Use case:</b> {selectedDocument.agent?.useCase || "—"}</p>
              </div>

              {!canCreateRecipeDraft ? (
                <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Draft này không còn đủ điều kiện tạo recipe draft. Cần status approved, apply_status pending_apply, validation valid, use case recipe_draft.
                </p>
              ) : null}

              {result ? (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p><b>Recipe:</b> {result.recipe.title}</p>
                  <p><b>ID:</b> {result.recipe.id}</p>
                  <p><b>Slug:</b> {result.recipe.slug}</p>
                  <p><b>Status:</b> {result.recipe.status}</p>
                  <p><b>Ingredients:</b> {result.counts.ingredients}</p>
                  <p><b>Steps:</b> {result.counts.steps}</p>
                </div>
              ) : null}

              <div className="mt-5">
                <h3 className="font-bold">AI draft JSON</h3>
                <pre className="mt-2 max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-white">{safeJson(selectedDocument.jsonPayload)}</pre>
              </div>

              <div className="mt-5">
                <h3 className="font-bold">Review logs</h3>
                {detail?.reviewLogs.length === 0 ? <p className="mt-2 text-sm text-slate-500">Chưa có log duyệt.</p> : null}
                <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {detail?.reviewLogs.map((log) => (
                    <div key={log.id} className="p-3 text-sm">
                      <p><b>{log.toStatus}</b> · {formatDate(log.createdAt)}</p>
                      {log.note ? <p className="mt-1 text-slate-500">{log.note}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
