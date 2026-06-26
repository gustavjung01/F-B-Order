"use client";

type Props = {
  controlId: string;
  name: string;
  values: string[];
  selected: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
};

export function ChoiceControl(props: Props) {
  if (props.values.length <= 3) {
    return (
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{props.name}</legend>
        <div className="flex flex-wrap gap-1.5">
          {props.values.map((value) => {
            const active = props.selected === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => props.onSelect(value)}
                className={`min-h-10 rounded-[12px] border px-3 py-2 text-xs font-black transition active:scale-[0.98] ${
                  active
                    ? "border-[#ff5a00] bg-[#fff3e8] text-[#d84b00] ring-1 ring-[#ff5a00]"
                    : "border-[#e7dccd] bg-white text-slate-700 hover:border-[#ffb27a]"
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{props.name}</p>
      <button
        type="button"
        aria-expanded={props.expanded}
        aria-controls={props.controlId}
        onClick={props.onToggle}
        className="flex h-11 w-full items-center justify-between rounded-[12px] border border-[#e7dccd] bg-white px-3 text-left text-sm font-black text-slate-700"
      >
        <span className="truncate">{props.selected || `Chọn ${props.name.toLowerCase()}`}</span>
        <span className={`ml-3 text-xs transition ${props.expanded ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {props.expanded ? (
        <div id={props.controlId} className="mt-2 max-h-44 overflow-y-auto rounded-[12px] border border-[#e7dccd] bg-white p-1.5 shadow-sm">
          {props.values.map((value) => {
            const active = props.selected === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => props.onSelect(value)}
                className={`flex min-h-10 w-full items-center rounded-[10px] px-3 text-left text-sm font-black ${
                  active ? "bg-[#fff3e8] text-[#d84b00]" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
