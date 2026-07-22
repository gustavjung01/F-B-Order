"use client";

import { AdminAlert, AdminBadge, AdminEmptyState } from "../ui/AdminUI";

export type RecipeCostPreviewData = {
  status: "ready" | "partial" | "unavailable";
  recipeId: string;
  recipeTitle: string;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  knownMandatoryCost: number;
  optionalCost: number;
  totalWithOptional: number;
  costPerYield: number | null;
  calculatedLineCount: number;
  missingMandatoryCount: number;
  lines: Array<{
    productName: string;
    quantity: number | null;
    unit: string | null;
    optional: boolean;
    catalogVariantId: string | null;
    sku: string | null;
    status:
      | "calculated"
      | "missing_quantity"
      | "missing_catalog"
      | "missing_price"
      | "missing_package_size"
      | "unit_mismatch"
      | "nested_recipe";
    reason: string | null;
    priceSource: "shop" | "retail" | null;
    packagePrice: number | null;
    packageLabel: string | null;
    unitCost: number | null;
    lineCost: number | null;
  }>;
};

const statusMeta = {
  ready: {
    title: "Đã tính đủ giá vốn",
    description: "Tất cả nguyên liệu bắt buộc đều có SKU, giá và quy cách có thể quy đổi.",
    tone: "success" as const,
  },
  partial: {
    title: "Mới tính được một phần",
    description: "Đang hiển thị phần chi phí xác định được. Chưa dùng số này làm giá vốn chính thức.",
    tone: "warning" as const,
  },
  unavailable: {
    title: "Chưa thể tính giá vốn",
    description: "Chưa có đủ nguyên liệu liên kết catalog, giá hoặc quy cách đóng gói.",
    tone: "danger" as const,
  },
};

const lineStatusLabel: Record<RecipeCostPreviewData["lines"][number]["status"], string> = {
  calculated: "Đã tính",
  missing_quantity: "Thiếu định lượng",
  missing_catalog: "Thiếu SKU",
  missing_price: "Thiếu giá",
  missing_package_size: "Thiếu quy cách",
  unit_mismatch: "Sai đơn vị",
  nested_recipe: "Thiếu cost nền",
};

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export function RecipeCostPreview({ cost }: { cost: RecipeCostPreviewData | null }) {
  if (!cost) {
    return <AdminEmptyState title="Chưa tính giá vốn" description="Bấm Tính giá vốn để kiểm tra dữ liệu catalog và định lượng hiện tại." />;
  }

  const meta = statusMeta[cost.status];
  return (
    <section className="grid gap-4" aria-label="Kết quả tính giá vốn">
      <AdminAlert tone={meta.tone} title={meta.title}>{meta.description}</AdminAlert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Chi phí bắt buộc đã biết</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{money(cost.knownMandatoryCost)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Trên mỗi {cost.yieldUnit || "đơn vị"}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{money(cost.costPerYield)}</p>
          {cost.yieldQuantity ? <p className="mt-1 text-xs font-bold text-slate-500">Yield: {cost.yieldQuantity} {cost.yieldUnit || ""}</p> : null}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Nguyên liệu đã tính</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{cost.calculatedLineCount}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Dòng bắt buộc còn thiếu</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{cost.missingMandatoryCount}</p>
        </article>
      </div>

      <div className="grid gap-3">
        {cost.lines.map((line, index) => {
          const calculated = line.status === "calculated";
          return (
            <article key={`${line.productName}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="font-black text-slate-950">{line.productName}</h5>
                    {line.optional ? <AdminBadge tone="neutral">Tùy chọn</AdminBadge> : null}
                    <AdminBadge tone={calculated ? "success" : "warning"}>{lineStatusLabel[line.status]}</AdminBadge>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {line.quantity ?? "—"} {line.unit || ""}{line.sku ? ` · ${line.sku}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-black text-slate-950">{money(line.lineCost)}</p>
              </div>

              {calculated ? (
                <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600 sm:grid-cols-2">
                  <p>Giá {line.priceSource === "shop" ? "sỉ" : "lẻ"}: {money(line.packagePrice)}</p>
                  <p>Quy cách: {line.packageLabel || "—"}</p>
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold leading-5 text-amber-900">{line.reason || "Chưa đủ dữ liệu để tính."}</p>
              )}
            </article>
          );
        })}
      </div>

      {cost.optionalCost > 0 ? (
        <p className="text-xs font-bold leading-5 text-slate-500">
          Nguyên liệu tùy chọn có chi phí {money(cost.optionalCost)} và không được cộng vào giá vốn bắt buộc. Tổng nếu dùng tất cả: {money(cost.totalWithOptional)}.
        </p>
      ) : null}
    </section>
  );
}
