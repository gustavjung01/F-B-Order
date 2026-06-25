"use client";

import type { CatalogV2FilterOption } from "@/data/catalog-v2/product-model";

export function TeaGroupFilter(props: {
  industries: CatalogV2FilterOption[];
  groups: CatalogV2FilterOption[];
  industry: string;
  group: string;
  showGroups: boolean;
  total: number;
  onIndustry: (value: string) => void;
  onGroup: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <section className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-[#eee7dc]">
      <div className={`grid gap-2 ${props.showGroups ? "grid-cols-2" : "grid-cols-1"}`}>
        <label className="grid min-w-0 gap-1">
          <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Ngành nguyên liệu</span>
          <select value={props.industry} onChange={(event) => props.onIndustry(event.target.value)} className="h-11 min-w-0 rounded-[14px] border border-[#e7dccd] bg-white px-2 text-xs font-black outline-none">
            <option value="all">Tất cả ngành</option>
            {props.industries.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.productCount})</option>)}
          </select>
        </label>
        {props.showGroups ? (
          <label className="grid min-w-0 gap-1">
            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Nhóm sản phẩm</span>
            <select value={props.group} onChange={(event) => props.onGroup(event.target.value)} className="h-11 min-w-0 rounded-[14px] border border-[#e7dccd] bg-white px-2 text-xs font-black outline-none">
              <option value="all">Tất cả nhóm</option>
              {props.groups.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.productCount})</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] font-black text-slate-500">
        <span>{props.total} sản phẩm</span>
        {props.industry !== "all" || props.group !== "all" ? <button type="button" onClick={props.onReset} className="text-[#ff5a00]">Xóa lọc</button> : null}
      </div>
    </section>
  );
}
