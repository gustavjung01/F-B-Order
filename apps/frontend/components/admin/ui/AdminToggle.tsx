import type { InputHTMLAttributes } from "react";

export function AdminToggle({ label, description, className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; description?: string }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3 py-3 ${className}`}>
      <span className="min-w-0">
        <span className="block text-sm font-black text-slate-800">{label}</span>
        {description ? <span className="mt-0.5 block text-xs font-medium text-slate-500">{description}</span> : null}
      </span>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-orange-500" {...props} />
    </label>
  );
}
