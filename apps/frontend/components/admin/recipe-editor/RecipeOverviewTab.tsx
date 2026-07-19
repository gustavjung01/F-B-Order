"use client";

import type { FormState, UploadPhase } from "./types";
import { uploadPhaseLabel } from "./types";
import { FileButton, UnitSelect } from "./RecipeEditorChrome";

export function RecipeOverviewTab({
  form,
  locked,
  uploading,
  coverPhase,
  onPatch,
  onUploadCover,
  onRemoveCover,
}: {
  form: FormState;
  locked: boolean;
  uploading: boolean;
  coverPhase?: UploadPhase;
  onPatch: (patch: Partial<FormState>) => void;
  onUploadCover: (file: File) => void;
  onRemoveCover: () => void;
}) {
  const activeUpload = coverPhase && !new Set<UploadPhase>(["done", "error"]).has(coverPhase);
  return (
    <div className="space-y-4">
      <section className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-lg font-black">Thông tin chính</h3><p className="text-sm font-bold text-slate-500">Những dữ liệu khách hàng nhìn thấy đầu tiên.</p></div>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">Tổng quan</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs font-black text-slate-600">Tên công thức *<input disabled={locked} value={form.title} onChange={(event) => onPatch({ title: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
          <label className="grid gap-1 text-xs font-black text-slate-600">Slug<input disabled={locked} value={form.slug} onChange={(event) => onPatch({ slug: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
          <label className="grid gap-1 text-xs font-black text-slate-600">Yield gốc<input disabled={locked} inputMode="decimal" value={form.yieldQuantity} onChange={(event) => onPatch({ yieldQuantity: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
          <label className="grid gap-1 text-xs font-black text-slate-600">Đơn vị yield<UnitSelect disabled={locked} value={form.yieldUnit} onChange={(yieldUnit) => onPatch({ yieldUnit })} /></label>
          <label className="grid gap-1 text-xs font-black text-slate-600">Thương hiệu liên quan<input disabled={locked} value={form.relatedBrand} onChange={(event) => onPatch({ relatedBrand: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
          <label className="grid gap-1 text-xs font-black text-slate-600">Thứ tự hiển thị<input disabled={locked} type="number" value={form.sortOrder} onChange={(event) => onPatch({ sortOrder: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
        </div>
        <label className="mt-3 grid gap-1 text-xs font-black text-slate-600">Mô tả ngắn<textarea disabled={locked} value={form.shortDescription} onChange={(event) => onPatch({ shortDescription: event.target.value })} className="min-h-20 rounded-xl bg-slate-100 p-3 text-sm font-bold" /></label>
        <label className="mt-3 grid gap-1 text-xs font-black text-slate-600">Ghi chú công thức<textarea disabled={locked} value={form.description} onChange={(event) => onPatch({ description: event.target.value })} className="min-h-24 rounded-xl bg-slate-100 p-3 text-sm font-bold" /></label>
        <label className="mt-3 grid gap-1 text-xs font-black text-slate-600">Ghi chú thay đổi<input disabled={locked} value={form.changeNote} onChange={(event) => onPatch({ changeNote: event.target.value })} className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold" /></label>
      </section>

      <section className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-lg font-black">Ảnh bìa</h3><p className="text-sm font-bold text-slate-500">Resize tối đa 1920px, WebP và thumbnail 480px.</p></div>
          {!locked ? <FileButton disabled={uploading} label={activeUpload ? uploadPhaseLabel[coverPhase!] : "Tải ảnh từ máy"} onFile={onUploadCover} /> : null}
        </div>
        {form.coverImageUrl ? (
          <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
            <img src={form.coverThumbnailUrl || form.coverImageUrl} alt="Thumbnail ảnh bìa" className="h-44 w-full rounded-2xl bg-slate-100 object-cover" />
            <div className="rounded-2xl bg-slate-100 p-4 text-sm font-bold">
              <p>{form.coverMediaId ? `Media ID: ${form.coverMediaId}` : "Ảnh URL/catalog chưa có media ID"}</p>
              {form.coverMediaId ? <p className="mt-1 text-emerald-700">Ảnh chính và thumbnail đang được theo dõi trong database.</p> : null}
              {!locked ? <button type="button" onClick={onRemoveCover} className="mt-4 rounded-xl bg-red-50 px-4 py-2 font-black text-red-700">Gỡ ảnh khỏi công thức</button> : null}
            </div>
          </div>
        ) : <div className="mt-3 grid h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-sm font-black text-slate-400">Chưa có ảnh bìa</div>}
      </section>
    </div>
  );
}
