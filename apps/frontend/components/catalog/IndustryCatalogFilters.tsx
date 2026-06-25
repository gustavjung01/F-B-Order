"use client";

import type { CatalogV2FilterOption } from "@/data/catalog-v2/product-model";

export function IndustryCatalogFilters({
  industries,
  selectedIndustry,
  onIndustryChange,
  onReset,
  resultCount,
}: {
  industries: CatalogV2FilterOption[];
  selectedIndustry: string;
  onIndustryChange: (value: string) => void;
  onReset: () => void;
  resultCount: number;
}) {
  const selectedName = industries.find((item) => item.id === selectedIndustry)?.name;

  return (
    <section className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-[#eee7dc] md:rounded-[26px] md:p-5">
      <div className="flex items-end gap-3">
        <label className="grid min-w-0 flex-1 gap-1.5">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Ngành nguyên liệu</span>
          <select
            value={selectedIndustry}
            onChange={(event) => onIndustryChange(event.target.value)}
            className="h-12 min-w-0 rounded-[16px] border border-[#e7dccd] bg-white px-3 text-sm font-black text-[#0b1220] outline-none focus:border-[#ff5a00]"
          >
            <option value="all">Tất cả ngành nguyên liệu</option>
            {industries.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({option.productCount})
              </option>
            ))}
          </select>
        </label>
        <span className="grid h-12 shrink-0 place-items-center rounded-[16px] bg-[#fff3ea] px-3 text-xs font-black text-[#ff5a00]">
          {resultCount}
        </span>
      </div>

      {selectedIndustry !== "all" && selectedName ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 rounded-full bg-[#fff3ea] px-3 py-2 text-xs font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]"
        >
          {selectedName} ×
        </button>
      ) : null}
    </section>
  );
}
