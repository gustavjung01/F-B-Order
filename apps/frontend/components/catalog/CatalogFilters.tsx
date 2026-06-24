"use client";

import { useState } from "react";
import type { CatalogV2FilterOption } from "@/data/catalog-v2/product-model";

type CatalogFiltersProps = {
  industries: CatalogV2FilterOption[];
  brands: CatalogV2FilterOption[];
  selectedIndustry: string;
  selectedBrand: string;
  onIndustryChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onReset: () => void;
  resultCount: number;
  hideBrandFilter?: boolean;
};

function FilterFields({
  industries,
  brands,
  selectedIndustry,
  selectedBrand,
  onIndustryChange,
  onBrandChange,
  hideBrandFilter = false,
}: Omit<CatalogFiltersProps, "onReset" | "resultCount">) {
  return (
    <div className={`grid gap-3 ${hideBrandFilter ? "" : "md:grid-cols-2"}`}>
      <label className="grid gap-1.5">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Ngành hàng</span>
        <select
          value={selectedIndustry}
          onChange={(event) => onIndustryChange(event.target.value)}
          className="h-12 rounded-[16px] border border-[#e7dccd] bg-white px-4 text-sm font-black text-[#0b1220] outline-none focus:border-[#ff5a00]"
        >
          <option value="all">Tất cả ngành hàng</option>
          {industries.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} ({option.productCount})
            </option>
          ))}
        </select>
      </label>

      {!hideBrandFilter ? (
        <label className="grid gap-1.5">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Thương hiệu</span>
          <select
            value={selectedBrand}
            onChange={(event) => onBrandChange(event.target.value)}
            className="h-12 rounded-[16px] border border-[#e7dccd] bg-white px-4 text-sm font-black text-[#0b1220] outline-none focus:border-[#ff5a00]"
          >
            <option value="all">Tất cả thương hiệu</option>
            {brands.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({option.productCount})
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function CatalogFilters(props: CatalogFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const hideBrandFilter = props.hideBrandFilter ?? false;
  const hasFilter = props.selectedIndustry !== "all" || (!hideBrandFilter && props.selectedBrand !== "all");
  const selectedIndustryName = props.industries.find((item) => item.id === props.selectedIndustry)?.name;
  const selectedBrandName = hideBrandFilter
    ? undefined
    : props.brands.find((item) => item.id === props.selectedBrand)?.name;
  const filterDescription = hideBrandFilter
    ? "Đông Lạnh chỉ lọc theo ngành hàng"
    : "Chọn theo ngành hàng và thương hiệu";
  const mobileFilterLabel = hideBrandFilter ? "Bộ lọc: Đông Lạnh" : "Bộ lọc: Ngành hàng · Thương hiệu";

  return (
    <>
      <div className="hidden rounded-[26px] bg-white p-5 shadow-sm ring-1 ring-[#eee7dc] md:block">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[#ff5a00]">Bộ lọc sản phẩm</p>
            <p className="mt-1 text-sm font-bold text-slate-500">{filterDescription}</p>
          </div>
          {hasFilter ? (
            <button type="button" onClick={props.onReset} className="rounded-full bg-[#fff3ea] px-4 py-2 text-sm font-black text-[#ff5a00]">
              Xóa bộ lọc
            </button>
          ) : null}
        </div>
        <FilterFields {...props} hideBrandFilter={hideBrandFilter} />
      </div>

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-12 w-full items-center justify-between rounded-[16px] bg-white px-4 text-sm font-black text-[#0b1220] shadow-sm ring-1 ring-[#eee7dc]"
        >
          <span>{mobileFilterLabel}</span>
          <span className="rounded-full bg-[#fff3ea] px-2.5 py-1 text-xs text-[#ff5a00]">{props.resultCount}</span>
        </button>
      </div>

      {hasFilter ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedIndustryName ? (
            <button type="button" onClick={() => props.onIndustryChange("all")} className="rounded-full bg-[#fff3ea] px-3 py-2 text-xs font-black text-[#ff5a00] ring-1 ring-[#ffd0b3]">
              {selectedIndustryName} ×
            </button>
          ) : null}
          {selectedBrandName ? (
            <button type="button" onClick={() => props.onBrandChange("all")} className="rounded-full bg-[#eefbf6] px-3 py-2 text-xs font-black text-[#08775f] ring-1 ring-[#b9eadb]">
              {selectedBrandName} ×
            </button>
          ) : null}
        </div>
      ) : null}

      {mobileOpen ? (
        <div className="fixed inset-0 z-[90] bg-slate-950/45 md:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="Đóng bộ lọc" className="absolute inset-0 h-full w-full" onClick={() => setMobileOpen(false)} />
          <section className="absolute inset-x-0 bottom-0 rounded-t-[30px] bg-[#f7f3eb] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-[0_-24px_80px_rgba(15,23,42,0.28)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-[#0b1220]">Bộ lọc sản phẩm</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{filterDescription}</p>
              </div>
              <button type="button" onClick={() => setMobileOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg font-black ring-1 ring-[#eee7dc]">×</button>
            </div>

            <FilterFields {...props} hideBrandFilter={hideBrandFilter} />

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={props.onReset} className="h-12 rounded-[16px] bg-white text-sm font-black text-slate-700 ring-1 ring-[#e7dccd]">
                Đặt lại
              </button>
              <button type="button" onClick={() => setMobileOpen(false)} className="h-12 rounded-[16px] bg-[#ff5a00] text-sm font-black text-white">
                Xem {props.resultCount} sản phẩm
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
