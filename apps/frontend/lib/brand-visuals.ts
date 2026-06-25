export type BrandIconName = "spark" | "drop" | "leaf" | "crown" | "cube" | "wave";

export type BrandVisual = {
  label: string;
  shortLabel: string;
  icon: BrandIconName;
  background: string;
  foreground: string;
  border: string;
  accent: string;
};

const PALETTES = [
  { background: "#fff1ec", foreground: "#b42318", border: "#ffd2c7", accent: "#f04438" },
  { background: "#fff7e8", foreground: "#9a5b00", border: "#f6d99c", accent: "#f79009" },
  { background: "#eefbf6", foreground: "#08775f", border: "#b9eadb", accent: "#12a37d" },
  { background: "#eef4ff", foreground: "#3157a4", border: "#c9d8ff", accent: "#4c6edb" },
  { background: "#f6f0ff", foreground: "#6c3eb8", border: "#decdf8", accent: "#8b5bd6" },
  { background: "#fff0f6", foreground: "#a72867", border: "#f5c9df", accent: "#d6498d" },
];

const ICONS: BrandIconName[] = ["spark", "drop", "leaf", "crown", "cube", "wave"];

const KNOWN_BRANDS: Record<string, Omit<BrandVisual, "label" | "shortLabel">> = {
  torani: { icon: "spark", background: "#fff1ec", foreground: "#b42318", border: "#ffd2c7", accent: "#f04438" },
  pixe: { icon: "drop", background: "#fff7e8", foreground: "#9a5b00", border: "#f6d99c", accent: "#f79009" },
  dingfong: { icon: "leaf", background: "#fff0f0", foreground: "#9f1f2d", border: "#f6c7cc", accent: "#dc3545" },
  "ding fong": { icon: "leaf", background: "#fff0f0", foreground: "#9f1f2d", border: "#f6c7cc", accent: "#dc3545" },
  "mama gold": { icon: "crown", background: "#fff8e8", foreground: "#7c5410", border: "#ecd6a0", accent: "#c9972c" },
  mama: { icon: "crown", background: "#fff8e8", foreground: "#7c5410", border: "#ecd6a0", accent: "#c9972c" },
  bkgq: { icon: "cube", background: "#eefbf6", foreground: "#08775f", border: "#b9eadb", accent: "#12a37d" },
  monin: { icon: "wave", background: "#f6f0ff", foreground: "#6c3eb8", border: "#decdf8", accent: "#8b5bd6" },
  davinci: { icon: "drop", background: "#eef4ff", foreground: "#3157a4", border: "#c9d8ff", accent: "#4c6edb" },
};

function normalizeBrand(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hashBrand(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function shortLabel(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "BS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function getBrandVisual(brand: string | null | undefined): BrandVisual {
  const label = brand?.trim() || "Bếp Sỉ";
  const normalized = normalizeBrand(label);
  const known = KNOWN_BRANDS[normalized];
  if (known) {
    return { ...known, label, shortLabel: shortLabel(label) };
  }

  const hash = hashBrand(normalized);
  const palette = PALETTES[hash % PALETTES.length];
  return {
    ...palette,
    label,
    shortLabel: shortLabel(label),
    icon: ICONS[hash % ICONS.length],
  };
}
