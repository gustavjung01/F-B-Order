"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { adminApiFetch } from "@/lib/admin-api";
import { useAdminPermissions } from "../AdminPermissionProvider";
import {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminSurface,
  AdminSurfaceBody,
  AdminSurfaceHeader,
  AdminTextarea,
} from "../ui/AdminUI";

type OperationalScope = "catalog" | "cost" | "inventory" | "suppliers";

type Readiness = {
  scope: OperationalScope;
  status: "ready" | "empty";
  recordCount: number;
  message: string;
};

type OperationalContext = {
  schemaVersion: string;
  generatedAt: string;
  scopes: OperationalScope[];
  readiness: Readiness[];
};

const scopeLabels: Record<OperationalScope, string> = {
  catalog: "Catalog",
  cost: "Cost",
  inventory: "Kho",
  suppliers: "Nhà cung cấp",
};

export function OperationalIntelligencePanel() {
  const { getToken } = useAuth();
  const { has } = useAdminPermissions();
  const availableScopes = useMemo<OperationalScope[]>(() => {
    const next: OperationalScope[] = [];
    if (has("catalog.view")) next.push("catalog", "cost");
    if (has("inventory.view")) next.push("inventory");
    if (has("suppliers.view")) next.push("suppliers");
    return next;
  }, [has]);
  const [selectedScopes, setSelectedScopes] = useState<OperationalScope[]>(availableScopes);
  const [recipeId, setRecipeId] = useState("");
  const [prompt, setPrompt] = useState(
    "Phân tích Catalog, Cost, Kho và Nhà cung cấp. Nêu dữ liệu còn thiếu trước, sau đó chỉ ra cảnh báo vận hành dựa trên số liệu thật.",
  );
  const [context, setContext] = useState<OperationalContext | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelectedScopes((current) => {
      const retained = current.filter((scope) => availableScopes.includes(scope));
      const missing = availableScopes.filter((scope) => !retained.includes(scope));
      return [...retained, ...missing];
    });
  }, [availableScopes]);

  async function token() {
    const value = await getToken();
    if (!value) throw new Error("Không lấy được token đăng nhập.");
    return value;
  }

  function toggleScope(scope: OperationalScope) {
    setSelectedScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]);
  }

  function body() {
    return {
      scopes: selectedScopes,
      ...(recipeId.trim() ? { recipeId: recipeId.trim() } : {}),
    };
  }

  async function inspectContext() {
    if (!selectedScopes.length) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = await adminApiFetch<{ context: OperationalContext }>(
        "/api/admin/ai/operations/context",
        await token(),
        { method: "POST", body: JSON.stringify(body()) },
      );
      setContext(payload.context);
      setMessage("Đã kiểm tra dữ liệu vận hành mà AI được phép đọc.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không kiểm tra được context vận hành.");
    } finally {
      setBusy(false);
    }
  }

  async function runQuery() {
    if (!selectedScopes.length || prompt.trim().length < 3) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = await adminApiFetch<{ jobId: string; status: string }>(
        "/api/admin/ai/operations/query",
        await token(),
        {
          method: "POST",
          body: JSON.stringify({ ...body(), prompt: prompt.trim() }),
        },
      );
      setMessage(`Đã đưa Phase 3 job ${payload.jobId.slice(0, 8)} vào hàng đợi. Kết quả nằm ở danh sách AI jobs bên dưới.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được Phase 3 AI job.");
    } finally {
      setBusy(false);
    }
  }

  if (!has("ai.use")) {
    return <AdminEmptyState title="Không có quyền dùng AI vận hành" description="Tài khoản cần permission ai.use." />;
  }

  return (
    <AdminSurface>
      <AdminSurfaceHeader
        eyebrow="Phase 3"
        title="AI hiểu Catalog, Cost, Kho và Nhà cung cấp"
        description="Backend tính và lọc dữ liệu trước. AI chỉ phân tích context được cấp quyền; không tự bịa tồn kho, giá nhập, MOQ hoặc lead time."
        actions={<AdminButton size="sm" tone="secondary" disabled={busy || !selectedScopes.length} onClick={() => void inspectContext()}>Kiểm tra dữ liệu</AdminButton>}
      />
      <AdminSurfaceBody className="grid gap-4">
        {!availableScopes.length ? <AdminAlert tone="warning" title="Chưa có quyền dữ liệu">Cần ít nhất catalog.view, inventory.view hoặc suppliers.view.</AdminAlert> : null}
        {message ? <AdminAlert tone={message.startsWith("Đã") ? "success" : "warning"}>{message}</AdminAlert> : null}

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-black text-slate-950">Nguồn dữ liệu</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {availableScopes.map((scope) => {
              const checked = selectedScopes.includes(scope);
              return (
                <label key={scope} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm font-black ${checked ? "border-orange-400 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-600"}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleScope(scope)} />
                  {scopeLabels[scope]}
                </label>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <AdminField label="Câu hỏi vận hành" hint="Yêu cầu AI nêu dữ liệu thiếu trước khi kết luận.">
            <AdminTextarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </AdminField>
          <AdminField label="Recipe ID (không bắt buộc)" hint="Điền UUID để tính cost công thức cụ thể bằng backend.">
            <AdminInput value={recipeId} onChange={(event) => setRecipeId(event.target.value)} placeholder="UUID công thức" />
          </AdminField>
        </div>

        <div className="flex flex-wrap gap-2">
          <AdminButton tone="dark" disabled={busy || !selectedScopes.length || prompt.trim().length < 3} onClick={() => void runQuery()}>Phân tích dữ liệu vận hành</AdminButton>
          <AdminBadge tone="neutral">Không tự ghi dữ liệu</AdminBadge>
          <AdminBadge tone="neutral">Không tự đặt hàng</AdminBadge>
        </div>

        {context ? (
          <section className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-slate-950">Mức sẵn sàng dữ liệu</h3>
              <AdminBadge tone="neutral">{context.schemaVersion}</AdminBadge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {context.readiness.map((item) => (
                <article key={item.scope} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <b>{scopeLabels[item.scope]}</b>
                    <AdminBadge tone={item.status === "ready" ? "success" : "warning"}>{item.status === "ready" ? "Có dữ liệu" : "Đang trống"}</AdminBadge>
                  </div>
                  <p className="mt-3 text-2xl font-black text-slate-950">{item.recordCount}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{item.message}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </AdminSurfaceBody>
    </AdminSurface>
  );
}
