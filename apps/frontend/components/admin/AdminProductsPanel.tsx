"use client";

import { useMemo, useState } from "react";
import { hungPhatCatalog } from "@/data/catalog/hung-phat-catalog";

const ISSUE_LABELS: Record<string, string> = {
  all: "Tất cả",
  missing_package_size: "Thiếu quy cách",
  missing_unit: "Thiếu đơn vị",
  missing_price_retail: "Thiếu giá lẻ",
  missing_price_wholesale: "Thiếu giá sỉ",
  missing_image: "Thiếu ảnh",
  needs_official_sku: "Cần SKU công ty",
};

const ISSUE_OPTIONS = [
  "all",
  "missing_package_size",
  "missing_unit",
  "missing_price_retail",
  "missing_price_wholesale",
  "missing_image",
  "needs_official_sku",
] as const;

type IssueFilter = (typeof ISSUE_OPTIONS)[number];
type Product = (typeof hungPhatCatalog.products)[number];

function productHasIssue(product: Product, issue: IssueFilter) {
  return issue === "all" || product.dataIssues.includes(issue);
}

function safeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Đang cập nhật";
  return String(value);
}

export function AdminProductsPanel() {
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("missing_package_size");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    return ISSUE_OPTIONS.reduce<Record<string, number>>((acc, issue) => {
      acc[issue] = hungPhatCatalog.products.filter((product) => productHasIssue(product, issue)).length;
      return acc;
    }, {});
  }, []);

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return hungPhatCatalog.products.filter((product) => {
      if (!productHasIssue(product, issueFilter)) return false;
      if (!needle) return true;
      return [product.id, product.name, product.brand || "", product.categoryId, product.subcategoryId || ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [issueFilter, query]);

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-white p-5 text-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.22)] ring-1 ring-white/70">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-orange-600">Product catalog</p>
        <h2 className="mt-2 text-3xl font-black">Lọc dữ liệu sản phẩm cần bổ sung</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Dữ liệu crawl từ nguồn công ty giữ nguyên. Bộ lọc dưới đây chỉ báo thiếu trường vận hành để bán hàng.</p>
      </section>

      <section className="rounded-[28px] bg-white p-4 text-slate-950 shadow-[0_18px_48px_rgba(0,0,0,0.2)] ring-1 ring-white/70">
        <div className="flex flex-col gap-3 md:flex-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, brand, id..." className="h-12 flex-1 rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-orange-500" />
          <select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value as IssueFilter)} className="h-12 rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none focus:border-orange-500">
            {ISSUE_OPTIONS.map((issue) => <option key={issue} value={issue}>{ISSUE_LABELS[issue]} ({counts[issue] || 0})</option>)}
          </select>
        </div>
      </section>

      <section className="rounded-[28px] bg-white p-4 text-slate-950 shadow-[0_18px_48px_rgba(0,0,0,0.2)] ring-1 ring-white/70">
        <h3 className="text-xl font-black">Sửa/import dữ liệu</h3>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Sửa file nguồn: <span className="font-black text-slate-950">docs/catalog/hung-phat-product-catalog-map.md</span></p>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">Import lại ở frontend:</p>
        <code className="mt-2 block rounded-[16px] bg-slate-950 px-4 py-3 text-sm font-black text-orange-200">npm run catalog:import</code>
      </section>

      <section className="grid gap-3">
        {products.map((product) => (
          <article key={product.id} className="rounded-[24px] bg-white p-4 text-slate-950 shadow-[0_14px_40px_rgba(0,0,0,0.18)] ring-1 ring-white/70">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-orange-600">{product.id}</p>
                <h3 className="mt-1 text-xl font-black leading-tight">{product.name}</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">{safeValue(product.brand)} · {product.categoryId}</p>
              </div>
              <span className="inline-flex rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-700 ring-1 ring-orange-200">{product.catalogKind}</span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <div className="rounded-[16px] bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Quy cách</p><p className="mt-1 font-black">{safeValue(product.packageSize)}</p></div>
              <div className="rounded-[16px] bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Đơn vị</p><p className="mt-1 font-black">{safeValue(product.unit)}</p></div>
              <div className="rounded-[16px] bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Giá</p><p className="mt-1 font-black">{safeValue(product.priceRetail)}</p></div>
              <div className="rounded-[16px] bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Ảnh</p><p className="mt-1 font-black">{product.imageUrls.length ? `${product.imageUrls.length} ảnh` : "Đang cập nhật"}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {product.dataIssues.map((issue) => <span key={issue} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{ISSUE_LABELS[issue] || issue}</span>)}
            </div>
          </article>
        ))}
        {products.length === 0 ? <div className="rounded-[24px] border border-dashed border-white/20 bg-white/[0.06] px-6 py-10 text-center text-sm font-black text-slate-300">Không có sản phẩm phù hợp bộ lọc.</div> : null}
      </section>
    </div>
  );
}
