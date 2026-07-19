import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

function join(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const adminStyles = {
  page: "min-h-screen bg-slate-100 text-slate-950",
  content: "mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6 md:py-6 xl:px-8",
  surface: "rounded-[24px] border border-slate-200 bg-white shadow-sm",
  surfaceMuted: "rounded-[20px] border border-slate-200 bg-slate-50",
  input: "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
  textarea: "min-h-24 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
  select: "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
} as const;

export function AdminSurface({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={join(adminStyles.surface, className)} {...props}>{children}</section>;
}

export function AdminSurfaceHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={join("flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-600">{eyebrow}</p> : null}
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminSurfaceBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={join("p-4 sm:p-5", className)} {...props} />;
}

export function AdminToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={join("grid gap-3 rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm md:flex md:flex-wrap md:items-end", className)} {...props} />;
}

export function AdminField({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  return (
    <label className={join("grid min-w-0 gap-1.5 text-sm font-bold text-slate-700", className)} {...props}>
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs font-bold text-rose-700">{error}</span> : hint ? <span className="text-xs font-medium text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function AdminInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={join(adminStyles.input, className)} {...props} />;
}

export function AdminSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={join(adminStyles.select, className)} {...props} />;
}

export function AdminTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={join(adminStyles.textarea, className)} {...props} />;
}

type ButtonTone = "primary" | "dark" | "success" | "danger" | "warning" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const buttonTone: Record<ButtonTone, string> = {
  primary: "bg-orange-500 text-white hover:bg-orange-600 focus:ring-orange-200",
  dark: "bg-slate-950 text-white hover:bg-slate-800 focus:ring-slate-300",
  success: "bg-emerald-700 text-white hover:bg-emerald-800 focus:ring-emerald-200",
  danger: "bg-rose-700 text-white hover:bg-rose-800 focus:ring-rose-200",
  warning: "bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-200",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus:ring-slate-200",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100 focus:ring-slate-200",
};

const buttonSize: Record<ButtonSize, string> = {
  sm: "min-h-9 rounded-lg px-3 text-xs",
  md: "min-h-11 rounded-xl px-4 text-sm",
  lg: "min-h-12 rounded-2xl px-5 text-sm",
};

export function AdminButton({
  tone = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={join(
        "inline-flex items-center justify-center gap-2 font-black transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-45",
        buttonTone[tone],
        buttonSize[size],
        className,
      )}
      {...props}
    />
  );
}

export function AdminBadge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" | "info" | "orange" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 ring-slate-200",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    danger: "bg-rose-50 text-rose-800 ring-rose-200",
    info: "bg-sky-50 text-sky-800 ring-sky-200",
    orange: "bg-orange-50 text-orange-800 ring-orange-200",
  } as const;
  return <span className={join("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ring-1", tones[tone], className)} {...props} />;
}

export function AdminAlert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-rose-200 bg-rose-50 text-rose-900",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={join("rounded-2xl border px-4 py-3 text-sm", tones[tone], className)}>
      {title ? <p className="font-black">{title}</p> : null}
      <div className={join(title && "mt-1", "font-medium leading-6")}>{children}</div>
    </div>
  );
}

export function AdminEmptyState({ title, description, action, className }: { title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={join("grid min-h-40 place-items-center rounded-[20px] border border-dashed border-slate-300 bg-slate-50 p-6 text-center", className)}>
      <div>
        <p className="font-black text-slate-800">{title}</p>
        {description ? <p className="mt-1 text-sm font-medium text-slate-500">{description}</p> : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

export function AdminStatCard({ label, value, active = false, onClick }: { label: string; value: ReactNode; active?: boolean; onClick?: () => void }) {
  const content = (
    <>
      <span className="block text-[11px] font-black uppercase tracking-[0.12em] opacity-65">{label}</span>
      <span className="mt-1 block text-2xl font-black">{value}</span>
    </>
  );
  const className = join(
    "rounded-[18px] border px-4 py-3 text-left transition",
    active ? "border-orange-500 bg-orange-500 text-white shadow-sm" : "border-slate-200 bg-white text-slate-800 hover:border-orange-300",
  );
  return onClick ? <button type="button" onClick={onClick} className={className}>{content}</button> : <div className={className}>{content}</div>;
}

export function AdminDialog({
  open,
  title,
  eyebrow,
  description,
  onClose,
  closeDisabled,
  children,
  footer,
  size = "lg",
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl" | "full";
}) {
  if (!open) return null;
  const widths = { md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl", full: "max-w-[1500px]" } as const;
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Đóng hộp thoại" className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label={title} className={join("relative z-10 flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white text-slate-950 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px]", widths[size])}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            {eyebrow ? <p className="text-[11px] font-black uppercase tracking-[0.15em] text-orange-600">{eyebrow}</p> : null}
            <h2 className="mt-1 truncate text-xl font-black tracking-tight sm:text-2xl">{title}</h2>
            {description ? <p className="mt-1 text-sm font-medium text-slate-500">{description}</p> : null}
          </div>
          <AdminButton aria-label="Đóng" tone="ghost" size="sm" disabled={closeDisabled} onClick={onClose} className="h-11 w-11 rounded-full px-0 text-xl">×</AdminButton>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 sm:px-6 sm:pb-5">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function AdminSegmentedTabs({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      {items.map((item) => (
        <button key={item.value} type="button" onClick={() => onChange(item.value)} className={join("shrink-0 rounded-xl px-4 py-2.5 text-sm font-black transition", value === item.value ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}>
          {item.label}{typeof item.count === "number" ? <span className="ml-2 opacity-65">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function AdminToast({ tone, children }: { tone: "success" | "danger"; children: ReactNode }) {
  return <div role={tone === "danger" ? "alert" : "status"} aria-live="polite" className={join("fixed bottom-24 left-1/2 z-[160] w-[min(92vw,560px)] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-2xl", tone === "danger" ? "bg-rose-700" : "bg-emerald-700")}>{children}</div>;
}
