"use client";

import { useMemo, useState } from "react";
import { hungPhatCatalog } from "@/data/catalog/hung-phat-catalog";

const labels: Record<string, string> = {
  all: "Tất cả",
  missing_package_size: "Thiếu quy cách",
  missing_unit: "Thiếu đơn vị",
  missing_price_retail: "Thiếu giá lẻ",
  missing_price_wholesale: "Thiếu giá sỉ",
  missing_image: "Thiếu ảnh",
  needs_official_sku: "Cần SKU công ty",
};

const filters = Object.keys(labels);

type FilterKey = keyof typeof labels;
type Product = (typeof hungPhatCatalog.products)[number];

function hasIssue(product: Product, key: string) {
  if (key === "all") return true;
  return (product.dataIssues as readonly string[]).includes(key);
}

function show(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "Đang cập nhật" : String(value);
}

export function AdminProductsAuditPanel() {
  const [filter, setFilter] = useState<FilterKey>("missing_package_size");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return hungPhatCatalog.products.filter((p) => {
      if (!hasIssue(p, filter)) return false;
      if (!needle) return true;
      return `${p.id} ${p.name} ${p.brand || ""}`.toLowerCase().includes(needle);
    });
  }, [filter, q]);

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">Sản phẩm</p>
        <h2 className="mt-2 text-3xl font-black">Audit dữ liệu catalog</h2>
        <p className="mt-2 text-sm font-bold text-slate-600">Thiếu dữ liệu ở đây là thiếu field vận hành, không phải dữ liệu crawl sai.</p>
      </section>

      <section className="rounded-[28px] bg-white p-4 text-slate-950 shadow-xl">
        <div className="flex flex-col gap-3 md:flex-row">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm sản phẩm..." className="h-12 flex-1 rounded-2xl bg-slate-100 px-4 font-bold outline-none" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} className="h-12 rounded-2xl bg-slate-100 px-4 font-black outline-none">
            {filters.map((key) => <option key={key} value={key}>{labels[key]}</option>)}
          </select>
        </div>
        <p className="mt-4 text-sm font-bold text-slate-600">Sửa file nguồn rồi chạy: <code className="rounded-lg bg-slate-950 px-2 py-1 text-orange-200">npm run catalog:import</code></p>
      </section>

      <section className="grid gap-3">
        {rows.map((p) => (
          <article key={p.id} className="rounded-[24px] bg-white p-4 text-slate-950 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-orange-600">{p.id}</p>
            <h3 className="mt-1 text-xl font-black">{p.name}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">{show(p.brand)} · {p.categoryId}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-100 p-3"><b>Quy cách</b><p>{show(p.packageSize)}</p></div>
              <div className="rounded-2xl bg-slate-100 p-3"><b>Đơn vị</b><p>{show(p.unit)}</p></div>
              <div className="rounded-2xl bg-slate-100 p-3"><b>Giá</b><p>{show(p.priceRetail)}</p></div>
              <div className="rounded-2xl bg-slate-100 p-3"><b>Ảnh</b><p>{p.imageUrls.length ? `${p.imageUrls.length} ảnh` : "Đang cập nhật"}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {p.dataIssues.map((issue) => <span key={issue} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{labels[issue] || issue}</span>)}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
