import { AdminBadge, AdminEmptyState } from "../ui/AdminUI";
import { AdminToggle } from "../ui/AdminToggle";
import type { RecipeSopDraftContent } from "./recipe-draft-types";

export function AiRecipeDraftDiff({
  content,
  selectedStepIds = [],
  selectable = false,
  onSelectionChange,
}: {
  content: RecipeSopDraftContent;
  selectedStepIds?: string[];
  selectable?: boolean;
  onSelectionChange?: (stepIds: string[]) => void;
}) {
  if (!content.proposal.steps.length) {
    return <AdminEmptyState title="Draft không có đề xuất" description="Worker không tạo được bước SOP hợp lệ để review." />;
  }

  function toggle(stepId: string, checked: boolean) {
    if (!onSelectionChange) return;
    const next = checked
      ? [...new Set([...selectedStepIds, stepId])]
      : selectedStepIds.filter((value) => value !== stepId);
    onSelectionChange(next);
  }

  return (
    <div className="grid gap-4">
      {content.proposal.steps.map((proposal, index) => {
        const current = proposal.currentStepNo
          ? content.baseSteps.find((step) => step.stepNo === proposal.currentStepNo) || null
          : null;
        const checked = selectedStepIds.includes(proposal.id);
        return (
          <article key={proposal.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <AdminBadge tone="orange">Đề xuất {index + 1}</AdminBadge>
                <AdminBadge tone={current ? "info" : "success"}>{current ? `Cập nhật bước ${current.stepNo}` : "Bước mới"}</AdminBadge>
                {current?.imageUrl ? <AdminBadge tone="neutral">Giữ ảnh hiện tại</AdminBadge> : null}
              </div>
              {selectable ? (
                <AdminToggle
                  label="Áp dụng phần này"
                  checked={checked}
                  onChange={(event) => toggle(proposal.id, event.target.checked)}
                  className="min-w-[210px]"
                />
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Hiện tại</p>
                {current ? (
                  <>
                    <h4 className="mt-2 font-black text-slate-900">{current.title || `Bước ${current.stepNo}`}</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-700">{current.content}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm font-medium text-slate-500">Chưa có bước tương ứng trong Recipe hiện tại.</p>
                )}
              </section>

              <section className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-orange-700">AI đề xuất</p>
                <h4 className="mt-2 font-black text-slate-900">{proposal.title}</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-700">{proposal.content}</p>
              </section>
            </div>
          </article>
        );
      })}
    </div>
  );
}
