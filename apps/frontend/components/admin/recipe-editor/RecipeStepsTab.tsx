"use client";

import { useState } from "react";
import type { Step, UploadPhase } from "./types";
import { uploadPhaseLabel } from "./types";
import { FileButton } from "./RecipeEditorChrome";

export function RecipeStepsTab({
  steps,
  locked,
  uploading,
  uploadStates,
  onUpdate,
  onAdd,
  onDelete,
  onMove,
  onOpenMediaPicker,
  onUpload,
}: {
  steps: Step[];
  locked: boolean;
  uploading: boolean;
  uploadStates: Record<string, UploadPhase>;
  onUpdate: (clientId: string, patch: Partial<Step>) => void;
  onAdd: () => void;
  onDelete: (clientId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onOpenMediaPicker: (clientId: string) => void;
  onUpload: (file: File, clientId: string) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <section data-recipe-steps-tab="true" className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200">
      <div id="recipe-ai-sop-target" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-black">Các bước thực hiện</h3><p className="text-sm font-bold text-slate-500">Kéo thả để đổi thứ tự. Ảnh được chọn bằng media picker có thumbnail.</p></div>
        {!locked ? <button type="button" onClick={onAdd} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">+ Thêm bước</button> : null}
      </div>

      <div className="mt-4 space-y-3">
        {steps.map((step, index) => {
          const uploadKey = `step:${step.clientId}`;
          const phase = uploadStates[uploadKey];
          const activeUpload = phase && !new Set<UploadPhase>(["done", "error"]).has(phase);
          return (
            <article
              key={step.clientId}
              draggable={!locked}
              onDragStart={(event) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", step.clientId);
              }}
              onDragOver={(event) => { if (!locked) event.preventDefault(); }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null) onMove(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`rounded-2xl bg-slate-100 p-3 ring-1 ring-slate-200 transition ${dragIndex === index ? "opacity-50" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden="true" className={`select-none text-lg font-black text-slate-400 ${locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}>⋮⋮</span>
                <b className="flex-1">Bước {index + 1}</b>
                {!locked ? <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Đưa bước ${index + 1} lên`} disabled={index === 0} onClick={() => onMove(index, index - 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black disabled:opacity-30">↑</button>
                  <button type="button" aria-label={`Đưa bước ${index + 1} xuống`} disabled={index === steps.length - 1} onClick={() => onMove(index, index + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => onDelete(step.clientId)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700">Xóa</button>
                </div> : null}
              </div>

              <input disabled={locked} value={step.title} onChange={(event) => onUpdate(step.clientId, { title: event.target.value })} placeholder="Tiêu đề bước" className="mt-3 h-11 w-full rounded-xl bg-white px-3 text-sm font-bold" />
              <textarea disabled={locked} value={step.content} onChange={(event) => onUpdate(step.clientId, { content: event.target.value })} placeholder="Hướng dẫn thực hiện" className="mt-2 min-h-28 w-full rounded-xl bg-white p-3 text-sm font-bold" />

              <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
                {step.imageUrl ? <img src={step.thumbnailUrl || step.imageUrl} alt={`Thumbnail bước ${index + 1}`} className="h-36 w-full rounded-xl bg-white object-contain" /> : <div className="grid h-36 place-items-center rounded-xl border-2 border-dashed border-slate-200 bg-white text-xs font-black text-slate-400">Không ảnh</div>}
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-sm font-black">Ảnh minh họa</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Chọn từ ảnh SKU, ảnh bìa, ảnh bước khác hoặc upload mới.</p>
                  {!locked ? <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => onOpenMediaPicker(step.clientId)} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Chọn từ media</button>
                    <FileButton disabled={uploading} label={activeUpload ? uploadPhaseLabel[phase!] : "Upload ảnh mới"} onFile={(file) => onUpload(file, step.clientId)} />
                    {step.imageUrl ? <button type="button" onClick={() => onUpdate(step.clientId, { imageUrl: "", thumbnailUrl: "", mediaId: null })} className="rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-700">Gỡ ảnh</button> : null}
                  </div> : null}
                  {step.mediaId ? <p className="mt-3 text-xs font-bold text-emerald-700">Media {step.mediaId.slice(0, 8)} · sẽ gắn vào step {index + 1} khi lưu</p> : step.imageUrl ? <p className="mt-3 text-xs font-bold text-amber-700">Ảnh catalog/URL không có media ID riêng.</p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!steps.length ? <div className="mt-4 grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-sm font-black text-slate-400">Chưa có bước thực hiện</div> : null}
    </section>
  );
}
