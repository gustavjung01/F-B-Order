"use client";

import type { ReactNode } from "react";
import { AdminBadge, AdminEmptyState } from "../ui/AdminUI";

type AuditSection = {
  title: string;
  content: string;
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

function parseAuditSections(raw: string): AuditSection[] {
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

function renderLine(source: string, index: number): ReactNode {
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

export function RecipeAiAuditResult({ text }: { text: string | null | undefined }) {
  const sections = parseAuditSections(text || "");
  if (!sections.length) {
    return <AdminEmptyState title="Chưa có kết quả" description="AI chưa trả về nội dung audit có thể đọc được." />;
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
            {section.content.split("\n").map(renderLine)}
          </div>
        </section>
      ))}
    </div>
  );
}
