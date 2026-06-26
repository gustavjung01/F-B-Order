import type { PublicRecipeStep } from "@/data/recipes/public-model";
import { formatRecipeNumber, formatStepDuration } from "./recipe-detail-utils";

export function RecipeStepCard({ step, index }: { step: PublicRecipeStep; index: number }) {
  const duration = formatStepDuration(step.durationSeconds);
  return (
    <article className="rounded-[25px] bg-[#fbfaf7] p-4 ring-1 ring-[#eee7dc] md:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ff5a00] text-sm font-black text-white shadow-[0_8px_18px_rgba(255,90,0,0.25)]">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-black text-[#0b1220]">{step.title || `Bước ${index + 1}`}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {duration ? <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-[#eee7dc]">⏱ {duration}</span> : null}
            {step.temperatureCelsius !== null ? <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-[#eee7dc]">🌡 {formatRecipeNumber(step.temperatureCelsius)}°C</span> : null}
          </div>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-line text-[14px] font-semibold leading-7 text-slate-600">{step.instruction}</p>
      {step.successMarker ? <div className="mt-3 rounded-[17px] bg-[#e9fbf2] p-3 text-[12px] font-bold leading-6 text-[#08775f] ring-1 ring-[#b9eadb]"><strong>Dấu hiệu đạt:</strong> {step.successMarker}</div> : null}
      {step.warning ? <div className="mt-3 rounded-[17px] bg-[#fff3ea] p-3 text-[12px] font-bold leading-6 text-[#c2410c] ring-1 ring-[#ffd0b3]"><strong>Lưu ý:</strong> {step.warning}</div> : null}
      {step.mediaUrl ? <img src={step.mediaUrl} alt={step.title || `Bước ${index + 1}`} className="mt-4 max-h-[420px] w-full rounded-[20px] object-cover" /> : null}
    </article>
  );
}
