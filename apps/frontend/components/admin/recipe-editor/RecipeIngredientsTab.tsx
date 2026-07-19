"use client";

import { useState } from "react";
import type { Ingredient } from "./types";
import { UnitSelect } from "./RecipeEditorChrome";

export function RecipeIngredientsTab({
  ingredients,
  locked,
  onUpdate,
  onAdd,
  onDelete,
  onOpenCatalog,
  onMove,
}: {
  ingredients: Ingredient[];
  locked: boolean;
  onUpdate: (clientId: string, patch: Partial<Ingredient>) => void;
  onAdd: () => void;
  onDelete: (clientId: string) => void;
  onOpenCatalog: (clientId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <section className="rounded-[24px] bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-black">Nguyên liệu</h3><p className="text-sm font-bold text-slate-500">Kéo thả để sắp xếp. Picker catalog mở trong dialog riêng.</p></div>
        {!locked ? <button type="button" onClick={onAdd} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">+ Thêm nguyên liệu</button> : null}
      </div>

      <div className="mt-4 space-y-3">
        {ingredients.map((item, index) => (
          <article
            key={item.clientId}
            draggable={!locked}
            onDragStart={(event) => {
              setDragIndex(index);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.clientId);
            }}
            onDragOver={(event) => {
              if (!locked) event.preventDefault();
            }}
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
              <b className="flex-1">Nguyên liệu {index + 1}</b>
              {!locked ? <div className="flex items-center gap-1">
                <button type="button" aria-label={`Đưa nguyên liệu ${index + 1} lên`} disabled={index === 0} onClick={() => onMove(index, index - 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black disabled:opacity-30">↑</button>
                <button type="button" aria-label={`Đưa nguyên liệu ${index + 1} xuống`} disabled={index === ingredients.length - 1} onClick={() => onMove(index, index + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white font-black disabled:opacity-30">↓</button>
                <button type="button" onClick={() => onDelete(item.clientId)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700">Xóa</button>
              </div> : null}
            </div>

            {item.catalogVariantId ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-16 w-16 rounded-lg bg-white object-contain" /> : <div className="grid h-16 w-16 place-items-center rounded-lg bg-white text-xs font-black text-slate-400">Không ảnh</div>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-emerald-900">{item.catalogLabel}</p><p className="mt-1 text-xs font-bold text-emerald-700">Đã liên kết SKU catalog</p></div>
                {!locked ? <button type="button" onClick={() => onUpdate(item.clientId, { catalogVariantId: null, catalogProductId: null, catalogLabel: "", imageUrl: null })} className="text-xs font-black text-red-700">Bỏ liên kết</button> : null}
              </div>
            ) : !locked ? (
              <button type="button" onClick={() => onOpenCatalog(item.clientId)} className="mt-3 flex w-full items-center justify-between rounded-xl border border-dashed border-orange-300 bg-orange-50 px-4 py-3 text-left text-sm font-black text-orange-800">
                <span>Chọn sản phẩm/SKU từ catalog</span><span aria-hidden="true">→</span>
              </button>
            ) : null}

            <div className="mt-3 grid gap-2 md:grid-cols-[1.4fr_.6fr_.8fr_1fr]">
              <input disabled={locked || Boolean(item.catalogVariantId)} value={item.productName} onChange={(event) => onUpdate(item.clientId, { productName: event.target.value })} placeholder="Tên nguyên liệu" className="h-11 rounded-xl bg-white px-3 text-sm font-bold" />
              <input disabled={locked} inputMode="decimal" value={item.quantity} onChange={(event) => onUpdate(item.clientId, { quantity: event.target.value })} placeholder="Số lượng" className="h-11 rounded-xl bg-white px-3 text-sm font-bold" />
              <UnitSelect disabled={locked} value={item.unit} onChange={(unit) => onUpdate(item.clientId, { unit })} />
              <input disabled={locked} value={item.note} onChange={(event) => onUpdate(item.clientId, { note: event.target.value })} placeholder="Ghi chú" className="h-11 rounded-xl bg-white px-3 text-sm font-bold" />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-600">
              <input type="checkbox" disabled={locked} checked={item.optional} onChange={(event) => onUpdate(item.clientId, { optional: event.target.checked })} className="h-4 w-4" />
              Nguyên liệu tùy chọn
            </label>
          </article>
        ))}
      </div>
      {!ingredients.length ? <div className="mt-4 grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-sm font-black text-slate-400">Chưa có nguyên liệu</div> : null}
    </section>
  );
}
