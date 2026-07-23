"use client";

import { AdminAlert, AdminBadge } from "../ui/AdminUI";
import type { RecipeRdDraftContent } from "./recipe-draft-types";

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Chưa tính được";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)} đ`;
}

function constraintTone(status: "met" | "failed" | "unverifiable") {
  if (status === "met") return "success" as const;
  if (status === "failed") return "danger" as const;
  return "warning" as const;
}

export function AiRecipeRdDiff({ content }: { content: RecipeRdDraftContent }) {
  return (
    <div className="grid gap-4">
      <AdminAlert tone="info" title="Mục tiêu R&D">{content.objective}</AdminAlert>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-950">{content.proposal.title}</h3>
            <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-slate-600">{content.proposal.rationale}</p>
          </div>
          <AdminBadge tone={content.evaluation.allRequiredConstraintsMet ? "success" : "warning"}>
            {content.evaluation.allRequiredConstraintsMet ? "Đạt ràng buộc" : "Cần kiểm tra ràng buộc"}
          </AdminBadge>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-500">Yield gốc</p>
          <p className="mt-1 text-lg font-black">{String(content.base.yieldQuantity ?? "—")} {content.base.yieldUnit || ""}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-500">Yield đề xuất</p>
          <p className="mt-1 text-lg font-black">{content.proposal.yieldQuantity} {content.proposal.yieldUnit}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-500">Cost gốc / yield</p>
          <p className="mt-1 text-lg font-black">{money(content.base.cost.costPerYield)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-500">Cost đề xuất / yield</p>
          <p className="mt-1 text-lg font-black">{money(content.evaluation.cost.costPerYield)}</p>
          {content.evaluation.costPercentDelta !== null ? (
            <p className="mt-1 text-xs font-bold text-slate-500">{content.evaluation.costPercentDelta > 0 ? "+" : ""}{content.evaluation.costPercentDelta}%</p>
          ) : null}
        </div>
      </div>

      <section className="grid gap-2">
        <h3 className="font-black text-slate-950">Kiểm tra ràng buộc</h3>
        {content.evaluation.constraints.length ? content.evaluation.constraints.map((item) => (
          <AdminAlert key={item.key} tone={constraintTone(item.status)} title={item.key}>{item.message}</AdminAlert>
        )) : <AdminAlert tone="info">Yêu cầu không đặt ràng buộc định lượng riêng.</AdminAlert>}
      </section>

      {content.evaluation.warnings.length ? (
        <section className="grid gap-2">
          <h3 className="font-black text-slate-950">Cảnh báo backend</h3>
          {content.evaluation.warnings.map((warning) => (
            <AdminAlert key={`${warning.code}-${warning.message}`} tone={warning.severity === "high" ? "danger" : warning.severity === "warning" ? "warning" : "info"} title={warning.code}>
              {warning.message}
            </AdminAlert>
          ))}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-slate-950">Nguyên liệu đề xuất</h3>
          <AdminBadge tone={content.evaluation.cost.status === "ready" ? "success" : "warning"}>{content.evaluation.cost.status}</AdminBadge>
        </div>
        <div className="mt-3 grid gap-2">
          {content.proposal.ingredients.map((ingredient, index) => {
            const stock = content.evaluation.inventory.find((item) => item.variantId === ingredient.catalogVariantId);
            return (
              <article key={`${ingredient.catalogVariantId}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-black text-slate-900">{ingredient.productName}</p>
                    <p className="mt-1 text-sm font-medium text-slate-600">{ingredient.quantity} {ingredient.unit}{ingredient.optional ? " · tùy chọn" : ""}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">SKU {ingredient.catalogSnapshot.sku}</p>
                  </div>
                  <AdminBadge tone={stock?.status === "available" ? "success" : stock?.status === "unavailable" ? "danger" : "warning"}>
                    {stock?.status === "available" ? "Có tồn" : stock?.status === "unavailable" ? "Hết tồn" : "Chưa có tồn"}
                  </AdminBadge>
                </div>
                {ingredient.note ? <p className="mt-2 text-xs font-medium text-slate-500">{ingredient.note}</p> : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-black text-slate-950">Các bước đề xuất</h3>
        <div className="mt-3 grid gap-2">
          {content.proposal.steps.map((step, index) => (
            <article key={`${step.title}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-black text-slate-900">{index + 1}. {step.title}</p>
              <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-slate-600">{step.content}</p>
            </article>
          ))}
        </div>
      </section>

      <AdminAlert tone={content.evaluation.capacity.status === "unavailable" ? "warning" : "info"} title="Ảnh hưởng năng lực bếp">
        {content.evaluation.capacity.message}
      </AdminAlert>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-black text-slate-950">Kế hoạch test</h3>
        <div className="mt-3 grid gap-2">
          {content.proposal.testPlan.map((item, index) => (
            <article key={`${item.metric}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-black text-slate-900">{item.metric}</p>
              <p className="mt-1 text-sm font-medium text-slate-600"><b>Mục tiêu:</b> {item.target}</p>
              <p className="mt-1 text-sm font-medium text-slate-600"><b>Cách đo:</b> {item.method}</p>
            </article>
          ))}
        </div>
      </section>

      {content.proposal.expectedEffects.length ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="font-black text-emerald-900">Ảnh hưởng kỳ vọng cần kiểm chứng</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-medium text-emerald-900">
            {content.proposal.expectedEffects.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      {content.proposal.risks.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-black text-amber-900">Rủi ro do AI nêu</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-medium text-amber-900">
            {content.proposal.risks.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
