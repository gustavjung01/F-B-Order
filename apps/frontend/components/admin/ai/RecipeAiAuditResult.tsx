"use client";

import type { ReactNode } from "react";
import { AdminBadge, AdminEmptyState } from "../ui/AdminUI";

type AuditSection = {
  title: string;
  content: string;
};

type RecipeAudit = {
  schemaVersion: 1;
  kind: "recipe_audit";
  score: number;
  readiness: "ready" | "needs_attention" | "not_ready";
  summary: string;
  findings: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
  }>;
  checklist: Array<{
    key: string;
    label: string;
    status: "pass" | "warning" | "missing";
    note: string;
    weight: number;
  }>;
  sop: Array<{ id: string; title: string; content: string }>;
  qualityControls: Array<{ id: string; label: string; target: string }>;
  missingData: string[];
};

const HIDDEN_SECTION_PATTERN = /^(?:hành động đề xuất|đề xuất hành động|proposed actions?|system actions?|dữ liệu hệ thống)$/i;
const TECHNICAL_KEY_PATTERN = /\b(?:action_key|target_type|target_id|required_permission|pending_approval|sourceInteractionId|sourceDraftId)\b/i;
const JSON_FIELD_PATTERN = /^\s*["']?(?:payload|status|reason|missing_fields|recipe_slugs_to_review)["']?\s*:/i;

const sectionTitleAliases: Record<string, string> = {
  "kết luận": "Kết luận nhanh",
  "lỗi phát hiện": "Điểm cần chỉnh",
  "vấn đề cần sửa": "Điểm cần chỉnh",
  "sop đề xuất": "SOP đề xuất",
  "kiểm soát chất lượng": "Tiêu chí kiểm soát",
  "tiêu chí đạt": "Tiêu chí kiểm soát",
  "dữ liệu thiếu": "Cần bổ sung",
  "dữ liệu còn thiếu": "Cần bổ sung",
  "dữ liệu cần bổ sung": "Cần bổ sung",
};

const readinessMeta = {
  ready: {
    label: "Có thể vận hành",
    description: "Các tiêu chí chính đã đạt. Vẫn cần người phụ trách kiểm tra trước khi publish.",
    tone: "success" as const,
    ring: "border-emerald-500 bg-emerald-50 text-emerald-800",
  },
  needs_attention: {
    label: "Cần chỉnh trước khi publish",
    description: "Công thức dùng được nhưng còn điểm ảnh hưởng tính đồng nhất hoặc tốc độ thao tác.",
    tone: "warning" as const,
    ring: "border-amber-500 bg-amber-50 text-amber-900",
  },
  not_ready: {
    label: "Chưa sẵn sàng vận hành",
    description: "Còn thiếu tiêu chí quan trọng. Không nên publish trước khi xử lý.",
    tone: "danger" as const,
    ring: "border-rose-500 bg-rose-50 text-rose-900",
  },
};

const checklistMeta = {
  pass: { label: "Đạt", symbol: "✓", tone: "success" as const, className: "border-emerald-200 bg-emerald-50" },
  warning: { label: "Cần chỉnh", symbol: "!", tone: "warning" as const, className: "border-amber-200 bg-amber-50" },
  missing: { label: "Thiếu", symbol: "–", tone: "danger" as const, className: "border-rose-200 bg-rose-50" },
};

const severityMeta = {
  high: { label: "Ưu tiên cao", tone: "danger" as const },
  medium: { label: "Cần chỉnh", tone: "warning" as const },
  low: { label: "Nên tối ưu", tone: "neutral" as const },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseStructuredAudit(value: string): RecipeAudit | null {
  try {
    const parsed: unknown = JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, ""));
    if (!isRecord(parsed) || parsed.kind !== "recipe_audit" || parsed.schemaVersion !== 1) return null;
    if (typeof parsed.score !== "number" || !["ready", "needs_attention", "not_ready"].includes(String(parsed.readiness))) return null;
    if (typeof parsed.summary !== "string") return null;
    if (!Array.isArray(parsed.findings) || !Array.isArray(parsed.checklist) || !Array.isArray(parsed.sop) || !Array.isArray(parsed.qualityControls) || !Array.isArray(parsed.missingData)) return null;
    return parsed as unknown as RecipeAudit;
  } catch {
    return null;
  }
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+->\s+/g, " → ")
    .trim();
}

function normalizeTitle(value: string): string {
  return cleanInlineMarkdown(value)
    .replace(/^\d+[.)]\s*/, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

function displayTitle(value: string): string {
  const normalized = normalizeTitle(value);
  return sectionTitleAliases[normalized.toLocaleLowerCase("vi-VN")] || normalized;
}

function removeTechnicalCodeBlocks(value: string): string {
  return value.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (whole, body: string) => {
    return TECHNICAL_KEY_PATTERN.test(body) || JSON_FIELD_PATTERN.test(body) ? "" : body;
  });
}

function isTechnicalLine(value: string): boolean {
  const line = value.trim();
  if (!line) return false;
  if (TECHNICAL_KEY_PATTERN.test(line) || JSON_FIELD_PATTERN.test(line)) return true;
  return /^[{}\[\],]+$/.test(line);
}

function parseLegacySections(raw: string): AuditSection[] {
  const normalized = removeTechnicalCodeBlocks(raw)
    .replace(/\r\n?/g, "\n")
    .replace(/^```(?:markdown|text)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (!normalized) return [];

  const sections: AuditSection[] = [];
  let currentTitle = "Kết luận nhanh";
  let currentLines: string[] = [];
  let hidden = false;

  const flush = () => {
    const content = currentLines
      .filter((line) => !isTechnicalLine(line))
      .join("\n")
      .trim();
    if (!hidden && content) sections.push({ title: displayTitle(currentTitle), content });
    currentLines = [];
  };

  for (const sourceLine of normalized.split("\n")) {
    const heading = sourceLine.match(/^\s{0,3}#{1,6}\s*(.+?)\s*$/);
    if (heading) {
      flush();
      currentTitle = normalizeTitle(heading[1]);
      hidden = HIDDEN_SECTION_PATTERN.test(currentTitle);
      continue;
    }

    const boldHeading = sourceLine.match(/^\s*\*\*(?:\d+[.)]\s*)?([^*]{2,80})\*\*\s*$/);
    if (boldHeading) {
      flush();
      currentTitle = normalizeTitle(boldHeading[1]);
      hidden = HIDDEN_SECTION_PATTERN.test(currentTitle);
      continue;
    }

    if (!hidden) currentLines.push(sourceLine);
  }
  flush();

  return sections
    .filter((section) => !HIDDEN_SECTION_PATTERN.test(normalizeTitle(section.title)))
    .slice(0, 6);
}

function renderLegacyLine(source: string, index: number): ReactNode {
  const line = source.trim();
  if (!line || isTechnicalLine(line)) return null;

  const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
  if (numbered) {
    return (
      <div key={index} className="flex items-start gap-3">
        <AdminBadge tone="orange" className="mt-0.5 shrink-0">{numbered[1]}</AdminBadge>
        <p className="min-w-0 text-sm font-medium leading-6 text-slate-700">{cleanInlineMarkdown(numbered[2])}</p>
      </div>
    );
  }

  const bullet = line.match(/^[-*•]\s+(.+)$/);
  if (bullet) {
    return (
      <div key={index} className="flex items-start gap-2.5 pl-1">
        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
        <p className="min-w-0 text-sm font-medium leading-6 text-slate-700">{cleanInlineMarkdown(bullet[1])}</p>
      </div>
    );
  }

  const labelled = cleanInlineMarkdown(line).match(/^([^:：]{2,70})[:：]\s*(.+)$/);
  if (labelled) {
    return (
      <p key={index} className="text-sm font-medium leading-6 text-slate-700">
        <strong className="font-black text-slate-900">{labelled[1]}:</strong> {labelled[2]}
      </p>
    );
  }

  return <p key={index} className="text-sm font-medium leading-6 text-slate-700">{cleanInlineMarkdown(line)}</p>;
}

function StructuredAuditResult({ audit }: { audit: RecipeAudit }) {
  const readiness = readinessMeta[audit.readiness];

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 lg:grid-cols-[150px_minmax(0,1fr)] lg:items-center">
        <div className={`mx-auto flex h-32 w-32 flex-col items-center justify-center rounded-full border-[10px] ${readiness.ring}`}>
          <strong className="text-4xl font-black leading-none">{audit.score}</strong>
          <span className="mt-1 text-xs font-black uppercase tracking-wide">trên 100</span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AdminBadge tone={readiness.tone}>{readiness.label}</AdminBadge>
            <AdminBadge tone="neutral">8 tiêu chí vận hành</AdminBadge>
          </div>
          <h4 className="mt-3 text-xl font-black text-slate-950">Sức khỏe công thức</h4>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{audit.summary}</p>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{readiness.description}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-black text-slate-950">Checklist vận hành</h4>
          <span className="text-xs font-bold text-slate-500">Điểm được tính theo trọng số cố định</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {audit.checklist.map((item) => {
            const meta = checklistMeta[item.status];
            return (
              <article key={item.key} className={`rounded-2xl border p-3.5 ${meta.className}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-slate-900 shadow-sm" aria-hidden="true">{meta.symbol}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="font-black text-slate-950">{item.label}</h5>
                      <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>
                    </div>
                    <p className="mt-1.5 text-sm font-medium leading-5 text-slate-700">{item.note}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {audit.findings.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h4 className="font-black text-slate-950">Điểm cần xử lý</h4>
          <div className="mt-3 grid gap-3">
            {audit.findings.map((finding, index) => {
              const meta = severityMeta[finding.severity];
              return (
                <article key={finding.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminBadge tone="orange">{index + 1}</AdminBadge>
                    <AdminBadge tone={meta.tone}>{meta.label}</AdminBadge>
                    <h5 className="font-black text-slate-950">{finding.title}</h5>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{finding.detail}</p>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {audit.sop.length ? (
        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:p-5">
          <h4 className="font-black text-slate-950">SOP đề xuất</h4>
          <div className="mt-3 grid gap-3">
            {audit.sop.map((step, index) => (
              <article key={step.id} className="rounded-2xl border border-orange-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <AdminBadge tone="orange">Bước {index + 1}</AdminBadge>
                  <h5 className="font-black text-slate-950">{step.title}</h5>
                </div>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{step.content}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {audit.qualityControls.length ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h4 className="font-black text-slate-950">Tiêu chí kiểm soát</h4>
            <div className="mt-3 grid gap-3">
              {audit.qualityControls.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <h5 className="text-sm font-black text-slate-950">{item.label}</h5>
                  <p className="mt-1 text-sm font-medium leading-5 text-slate-700">{item.target}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h4 className="font-black text-slate-950">Dữ liệu cần bổ sung</h4>
          {audit.missingData.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {audit.missingData.map((item, index) => <AdminBadge key={`${item}-${index}`} tone="warning">{item}</AdminBadge>)}
            </div>
          ) : <p className="mt-3 text-sm font-medium text-slate-600">Chưa phát hiện dữ liệu bắt buộc nào còn thiếu.</p>}
        </section>
      </div>
    </div>
  );
}

function LegacyAuditResult({ text }: { text: string }) {
  const sections = parseLegacySections(text);
  if (!sections.length) {
    return <AdminEmptyState title="Chưa có kết quả" description="Trợ lý chưa trả về nội dung kiểm tra có thể đọc được." />;
  }

  return (
    <div className="grid gap-3">
      {sections.map((section, index) => (
        <section
          key={`${section.title}-${index}`}
          className={index === 0
            ? "rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:p-5"
            : "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"}
        >
          <div className="flex items-center gap-2">
            <AdminBadge tone={index === 0 ? "orange" : "neutral"}>{index + 1}</AdminBadge>
            <h4 className="font-black text-slate-950">{section.title}</h4>
          </div>
          <div className="mt-3 grid gap-2.5">
            {section.content.split("\n").map(renderLegacyLine)}
          </div>
        </section>
      ))}
    </div>
  );
}

export function RecipeAiAuditResult({ text }: { text: string | null | undefined }) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return <AdminEmptyState title="Chưa có kết quả" description="Trợ lý chưa hoàn thành kiểm tra công thức." />;
  }

  const structured = parseStructuredAudit(normalized);
  return structured ? <StructuredAuditResult audit={structured} /> : <LegacyAuditResult text={normalized} />;
}
