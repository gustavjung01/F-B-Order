"use client";

import { useState } from "react";
import type { CatalogV2FilterOption } from "@/data/catalog-v2/product-model";

type Visual = {
  icon: string;
  background: string;
  foreground: string;
  border: string;
};

const DEFAULT_VISUAL: Visual = {
  icon: "📦",
  background: "#f1f5f9",
  foreground: "#334155",
  border: "#cbd5e1",
};

const INDUSTRY_VISUALS: Record<string, Visual> = {
  "nguyen-lieu-tra-sua": { icon: "🧋", background: "#fff3e8", foreground: "#c2410c", border: "#fdba74" },
  "nguyen-lieu-mi-cay": { icon: "🍜", background: "#fff1f2", foreground: "#be123c", border: "#fda4af" },
  "nguyen-lieu-my-cay": { icon: "🍜", background: "#fff1f2", foreground: "#be123c", border: "#fda4af" },
  "dong-lanh": { icon: "❄️", background: "#eff6ff", foreground: "#1d4ed8", border: "#93c5fd" },
  "nguyen-lieu-banh-trang": { icon: "🌯", background: "#faf5ff", foreground: "#7e22ce", border: "#d8b4fe" },
  "bao-bi": { icon: "🥤", background: "#ecfdf5", foreground: "#047857", border: "#6ee7b7" },
};

const GROUP_VISUALS: Record<string, Visual> = {
  tra: { icon: "🍵", background: "#ecfdf5", foreground: "#047857", border: "#6ee7b7" },
  siro: { icon: "🍹", background: "#fff1f2", foreground: "#be123c", border: "#fda4af" },
  "sinh-to": { icon: "🥭", background: "#fffbeb", foreground: "#b45309", border: "#fcd34d" },
  sot: { icon: "🍫", background: "#fef3c7", foreground: "#92400e", border: "#fbbf24" },
  "tran-chau": { icon: "⚫", background: "#f8fafc", foreground: "#0f172a", border: "#94a3b8" },
  "3q": { icon: "🧊", background: "#ecfeff", foreground: "#0e7490", border: "#67e8f9" },
  "thach-rau-cau": { icon: "🍮", background: "#fdf4ff", foreground: "#a21caf", border: "#f0abfc" },
  "flan-pudding": { icon: "🍮", background: "#fff7ed", foreground: "#c2410c", border: "#fdba74" },
  "bot-sua-kem-beo": { icon: "🥛", background: "#f8fafc", foreground: "#475569", border: "#cbd5e1" },
  "bot-tao-vi": { icon: "🧂", background: "#f5f3ff", foreground: "#6d28d9", border: "#c4b5fd" },
  "sua-kem": { icon: "🥛", background: "#eff6ff", foreground: "#1d4ed8", border: "#93c5fd" },
  "milk-foam-kem-cheese": { icon: "🧀", background: "#fffbeb", foreground: "#a16207", border: "#fde047" },
  "duong-chat-tao-ngot": { icon: "🍯", background: "#fffbeb", foreground: "#b45309", border: "#fcd34d" },
  "trai-cay-hop": { icon: "🍑", background: "#fff1f2", foreground: "#be123c", border: "#fda4af" },
  "topping-khac": { icon: "✨", background: "#f5f3ff", foreground: "#7c3aed", border: "#c4b5fd" },
  "khac-da-duyet": { icon: "📦", background: "#f1f5f9", foreground: "#334155", border: "#cbd5e1" },
};

function parseSelection(value: string) {
  return value === "all" ? [] : value.split(",").map((item) => item.trim()).filter(Boolean);
}

function selectedText(options: CatalogV2FilterOption[], selected: string[], allText: string, unit: string) {
  if (selected.length === 0) return allText;
  if (selected.length === 1) return options.find((option) => option.id === selected[0])?.name || `1 ${unit}`;
  return `${selected.length} ${unit} đã chọn`;
}

function visualForIndustry(id: string) {
  return INDUSTRY_VISUALS[id] || DEFAULT_VISUAL;
}

function visualForGroup(id: string) {
  return GROUP_VISUALS[id] || DEFAULT_VISUAL;
}

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-black transition ${checked ? "border-[#ff5a00] bg-[#ff5a00] text-white" : "border-slate-300 bg-white text-transparent"}`}>
      ✓
    </span>
  );
}

function OptionRow(props: {
  option: CatalogV2FilterOption;
  checked: boolean;
  visual: Visual;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] px-2.5 py-2 transition hover:bg-slate-50 active:scale-[0.99]">
      <input type="checkbox" checked={props.checked} onChange={props.onChange} className="sr-only" />
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-lg"
        style={{ background: props.visual.background, color: props.visual.foreground, borderColor: props.visual.border }}
        aria-hidden="true"
      >
        {props.visual.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black text-slate-800">{props.option.name}</span>
        <span className="mt-0.5 block text-[10px] font-bold text-slate-500">{props.option.productCount} sản phẩm</span>
      </span>
      <CheckMark checked={props.checked} />
    </label>
  );
}

function AllRow(props: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] bg-[#fbfaf7] px-2.5 py-2 transition hover:bg-[#f7f3eb]">
      <input type="checkbox" checked={props.checked} onChange={props.onChange} className="sr-only" />
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#fed7aa] bg-[#fff7ed] text-lg" aria-hidden="true">🧺</span>
      <span className="min-w-0 flex-1 text-xs font-black text-slate-800">{props.label}</span>
      <CheckMark checked={props.checked} />
    </label>
  );
}

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
  const [openPanel, setOpenPanel] = useState<"industries" | "groups" | null>(null);
  const selectedIndustries = parseSelection(props.industry);
  const selectedGroups = parseSelection(props.group);
  const industrySummary = selectedText(props.industries, selectedIndustries, "Tất cả ngành", "ngành");
  const groupSummary = selectedText(props.groups, selectedGroups, "Tất cả nhóm", "nhóm");
  const industryIcon = selectedIndustries.length === 1 ? visualForIndustry(selectedIndustries[0]).icon : "🧺";
  const hasFilters = selectedIndustries.length > 0 || selectedGroups.length > 0;

  return (
    <section className="rounded-[22px] bg-white p-3.5 shadow-sm ring-1 ring-[#eee7dc]">
      <div className={`grid gap-2 ${props.showGroups ? "sm:grid-cols-2" : "grid-cols-1"}`}>
        <div className="min-w-0">
          <button
            type="button"
            aria-expanded={openPanel === "industries"}
            onClick={() => setOpenPanel((current) => current === "industries" ? null : "industries")}
            className="flex h-12 w-full items-center gap-2 rounded-[15px] border border-[#e7dccd] bg-white px-3 text-left outline-none transition hover:border-[#ffb27a] focus:border-[#ff5a00]"
          >
            <span className="text-lg" aria-hidden="true">{industryIcon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Ngành nguyên liệu</span>
              <span className="block truncate text-xs font-black text-slate-800">{industrySummary}</span>
            </span>
            <span className={`text-xs text-slate-400 transition ${openPanel === "industries" ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
          </button>
          {openPanel === "industries" ? (
            <div className="mt-2 rounded-[16px] border border-[#e7dccd] bg-white p-1.5 shadow-[0_14px_35px_rgba(15,23,42,0.12)]">
              <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain pr-1">
                <AllRow label="Tất cả ngành hàng" checked={selectedIndustries.length === 0} onChange={() => props.onIndustry("all")} />
                {props.industries.map((option) => (
                  <OptionRow
                    key={option.id}
                    option={option}
                    checked={selectedIndustries.includes(option.id)}
                    visual={visualForIndustry(option.id)}
                    onChange={() => props.onIndustry(option.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {props.showGroups ? (
          <div className="min-w-0">
            <button
              type="button"
              aria-expanded={openPanel === "groups"}
              onClick={() => setOpenPanel((current) => current === "groups" ? null : "groups")}
              className="flex h-12 w-full items-center gap-2 rounded-[15px] border border-[#e7dccd] bg-white px-3 text-left outline-none transition hover:border-[#ffb27a] focus:border-[#ff5a00]"
            >
              <span className="text-lg" aria-hidden="true">🗂️</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Nhóm sản phẩm</span>
                <span className="block truncate text-xs font-black text-slate-800">{groupSummary}</span>
              </span>
              <span className={`text-xs text-slate-400 transition ${openPanel === "groups" ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
            </button>
            {openPanel === "groups" ? (
              <div className="mt-2 rounded-[16px] border border-[#e7dccd] bg-white p-1.5 shadow-[0_14px_35px_rgba(15,23,42,0.12)]">
                <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain pr-1">
                  <AllRow label="Tất cả nhóm hàng" checked={selectedGroups.length === 0} onChange={() => props.onGroup("all")} />
                  {props.groups.map((option) => (
                    <OptionRow
                      key={option.id}
                      option={option}
                      checked={selectedGroups.includes(option.id)}
                      visual={visualForGroup(option.id)}
                      onChange={() => props.onGroup(option.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center justify-between px-0.5 text-[11px] font-black text-slate-500">
        <span>{props.total} sản phẩm phù hợp</span>
        {hasFilters ? <button type="button" onClick={props.onReset} className="rounded-lg px-2 py-1 text-[#ff5a00] hover:bg-[#fff3e8]">Xóa lọc</button> : null}
      </div>
    </section>
  );
}
