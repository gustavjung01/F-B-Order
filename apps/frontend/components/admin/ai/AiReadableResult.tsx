"use client";

import type { ReactNode } from "react";
import { AdminBadge, AdminEmptyState } from "../ui/AdminUI";

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json|markdown|text)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function labelFor(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toLocaleUpperCase("vi-VN"));
}

function renderStructured(value: unknown, path = "root"): ReactNode {
  if (value === null || value === undefined) return <p className="text-sm font-medium text-slate-500">Không có dữ liệu.</p>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <p className="whitespace-pre-line text-sm font-medium leading-6 text-slate-700">{String(value)}</p>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <p className="text-sm font-medium text-slate-500">Danh sách trống.</p>;
    return (
      <div className="grid gap-3">
        {value.map((item, index) => {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const record = item as Record<string, unknown>;
            const title = typeof record.title === "string" ? record.title : `Mục ${index + 1}`;
            const content = typeof record.content === "string" ? record.content : null;
            return (
              <article key={`${path}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <AdminBadge tone="neutral">{index + 1}</AdminBadge>
                  <h4 className="font-black text-slate-900">{title}</h4>
                </div>
                {content ? <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-slate-700">{content}</p> : renderStructured(record, `${path}-${index}`)}
              </article>
            );
          }
          return <div key={`${path}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">{renderStructured(item, `${path}-${index}`)}</div>;
        })}
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return <p className="text-sm font-medium text-slate-500">Không có dữ liệu.</p>;
  return (
    <div className="grid gap-3">
      {entries.map(([key, child]) => (
        <section key={`${path}-${key}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-black text-slate-900">{labelFor(key)}</h4>
          <div className="mt-2">{renderStructured(child, `${path}-${key}`)}</div>
        </section>
      ))}
    </div>
  );
}

export function AiReadableResult({ text, emptyMessage = "AI chưa có kết quả để hiển thị." }: { text: string | null | undefined; emptyMessage?: string }) {
  const normalized = stripCodeFence(text || "");
  if (!normalized) return <AdminEmptyState title="Chưa có kết quả" description={emptyMessage} />;

  try {
    return <div className="grid gap-3">{renderStructured(JSON.parse(normalized))}</div>;
  } catch {
    const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    return (
      <div className="grid gap-3">
        {blocks.map((block, index) => (
          <p key={index} className="whitespace-pre-line rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-700">{block}</p>
        ))}
      </div>
    );
  }
}
