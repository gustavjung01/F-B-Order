import type {
  PublicRecipeBusinessTip,
  PublicRecipeMistake,
  PublicRecipeSeasonalRule,
} from "@/data/recipes/public-model";

export function RecipeMistakeCard({ mistake }: { mistake: PublicRecipeMistake }) {
  const severityLabel = mistake.severity === "high" ? "Quan trọng" : mistake.severity === "low" ? "Nhẹ" : "Thường gặp";
  return (
    <details className="group rounded-[22px] bg-white p-4 ring-1 ring-[#efe7dc] open:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <span className="rounded-full bg-[#fff3ea] px-2.5 py-1 text-[10px] font-black text-[#c2410c] ring-1 ring-[#ffd0b3]">{severityLabel}</span>
          <h3 className="mt-2 text-[16px] font-black text-[#0b1220]">{mistake.title}</h3>
          <p className="mt-1 text-[12px] font-semibold text-slate-500">{mistake.symptom}</p>
        </div>
        <span className="text-xl font-black text-slate-400 transition group-open:rotate-45">＋</span>
      </summary>
      <div className="mt-4 space-y-3 text-[13px] font-semibold leading-6 text-slate-600">
        {mistake.likelyCauses.length ? <div><strong className="text-[#0b1220]">Nguyên nhân:</strong> {mistake.likelyCauses.join("; ")}</div> : null}
        {mistake.immediateFix ? <div><strong className="text-[#0b1220]">Cách xử lý ngay:</strong> {mistake.immediateFix}</div> : null}
        <div><strong className="text-[#0b1220]">Phòng tránh:</strong> {mistake.prevention}</div>
      </div>
    </details>
  );
}

export function RecipeBusinessTipCard({ tip }: { tip: PublicRecipeBusinessTip }) {
  const details = [
    ["Khách phù hợp", tip.targetCustomer], ["Thời điểm bán", tip.sellingMoment],
    ["Gợi ý combo", tip.comboSuggestion], ["Bao bì", tip.packagingSuggestion],
    ["Bảo quản", tip.storageSuggestion], ["Chuẩn bị theo mẻ", tip.batchPreparationSuggestion],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <article className="rounded-[22px] bg-white p-4 ring-1 ring-[#efe7dc]">
      <h3 className="text-[16px] font-black text-[#0b1220]">💡 {tip.title}</h3>
      <p className="mt-2 text-[13px] font-semibold leading-6 text-slate-600">{tip.recommendation}</p>
      {details.length ? (
        <dl className="mt-3 space-y-2">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-[15px] bg-[#fbfaf7] px-3 py-2 text-[12px] ring-1 ring-[#eee7dc]">
              <dt className="font-black text-[#0b1220]">{label}</dt>
              <dd className="mt-1 font-semibold leading-5 text-slate-500">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

export function RecipeSeasonalRuleCard({ rule }: { rule: PublicRecipeSeasonalRule }) {
  const condition = rule.type === "month_range"
    ? `Tháng ${rule.startMonth ?? "?"}–${rule.endMonth ?? "?"}`
    : rule.type === "festival" ? rule.festival
      : rule.type === "weather" ? rule.weatherCondition : "Phù hợp quanh năm";

  return (
    <article className="rounded-[22px] bg-white p-4 ring-1 ring-[#efe7dc]">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-[#f4efff] px-2.5 py-1 text-[10px] font-black text-[#7c3aed] ring-1 ring-[#dccbff]">{condition}</span>
        {rule.regions.map((region) => <span key={region} className="rounded-full bg-[#eefbf6] px-2.5 py-1 text-[10px] font-black text-[#08775f] ring-1 ring-[#b9eadb]">{region}</span>)}
      </div>
      <h3 className="mt-2 text-[16px] font-black text-[#0b1220]">{rule.title}</h3>
      <p className="mt-2 text-[13px] font-semibold leading-6 text-slate-600">{rule.suitabilityReason}</p>
      {rule.marketingMessage ? <p className="mt-3 rounded-[15px] bg-[#fff3ea] p-3 text-[12px] font-bold leading-5 text-[#c2410c] ring-1 ring-[#ffd0b3]">{rule.marketingMessage}</p> : null}
    </article>
  );
}
