"use client";

import { AdminBadge, AdminButton, AdminSelect } from "@/components/admin/ui/AdminUI";
import type { CompletionItem, EditorTab, UndoDelete } from "./types";
import { UNIT_OPTIONS } from "./types";

export function UnitSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <AdminSelect disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
      {!UNIT_OPTIONS.some(([unit]) => unit === value) && value ? <option value={value}>{value}</option> : null}
      {UNIT_OPTIONS.map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}
    </AdminSelect>
  );
}

export function FileButton({ label, disabled, onFile }: { label: string; disabled?: boolean; onFile: (file: File) => void }) {
  return (
    <label className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black transition ${disabled ? "cursor-not-allowed bg-slate-200 text-slate-400" : "cursor-pointer bg-orange-500 text-white hover:bg-orange-600"}`}>
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

const tabs: Array<{ id: EditorTab; label: string; hint: string }> = [
  { id: "overview", label: "Tổng quan", hint: "Thông tin và ảnh bìa" },
  { id: "ingredients", label: "Nguyên liệu", hint: "SKU và định lượng" },
  { id: "steps", label: "Các bước", hint: "Nội dung và media" },
  { id: "publish", label: "Xuất bản", hint: "Review và phiên bản" },
];

export function RecipeEditorTabs({ activeTab, onChange, tabIssues }: { activeTab: EditorTab; onChange: (tab: EditorTab) => void; tabIssues: Partial<Record<EditorTab, number>> }) {
  return (
    <nav aria-label="Các phần của công thức" className="border-b border-slate-200 bg-white px-3 md:px-5">
      <div className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          const issues = tabIssues[tab.id] || 0;
          return (
            <button key={tab.id} type="button" aria-current={active ? "page" : undefined} onClick={() => onChange(tab.id)} className={`relative min-w-0 border-b-2 px-2 py-3 text-left transition ${active ? "border-orange-500 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
              <span className="block truncate text-sm font-black">{tab.label}</span>
              <span className="hidden truncate text-xs font-medium md:block">{tab.hint}</span>
              {issues ? <span className="absolute right-1 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-rose-700 px-1 text-[10px] font-black text-white">{issues}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function RecipeCompletionBar({ items, onJump }: { items: CompletionItem[]; onJump: (tab: EditorTab) => void }) {
  const completeCount = items.filter((item) => item.complete).length;
  const percent = Math.round((completeCount / items.length) * 100);
  const missing = items.filter((item) => !item.complete);
  return (
    <section className="border-b border-slate-200 bg-slate-50 px-4 py-3 md:px-5" aria-label="Mức hoàn thiện công thức">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div><b>{percent}% hoàn thiện</b><span className="ml-2 font-medium text-slate-500">{missing.length ? `Còn ${missing.length} mục` : "Đủ điều kiện gửi review"}</span></div>
        <AdminBadge tone={missing.length ? "warning" : "success"}>{completeCount}/{items.length}</AdminBadge>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
      {missing.length ? <div className="mt-2 flex flex-wrap gap-2">{missing.map((item) => <AdminButton key={item.id} type="button" size="sm" tone="secondary" onClick={() => onJump(item.tab)}>Thiếu: {item.label}</AdminButton>)}</div> : null}
    </section>
  );
}

export function RecipeUndoToast({ undo, onUndo, onDismiss }: { undo: UndoDelete | null; onUndo: () => void; onDismiss: () => void }) {
  if (!undo) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-24 left-1/2 z-[160] flex w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white shadow-2xl">
      <span className="min-w-0 flex-1 font-bold">Đã xóa {undo.label}.</span>
      <AdminButton size="sm" tone="secondary" onClick={onUndo}>Hoàn tác</AdminButton>
      <AdminButton size="sm" tone="ghost" aria-label="Đóng thông báo hoàn tác" onClick={onDismiss} className="text-white hover:bg-white/10">×</AdminButton>
    </div>
  );
}
