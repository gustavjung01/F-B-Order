export type CatalogChoiceGroup = {
  key: string;
  name: string;
  required: boolean;
  values: string[];
  valuesBySku?: Record<string, string[]>;
};

export function normalizeChoiceKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeChoiceValues(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
    : [];
}

function parseValuesBySku(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([sku, rawValues]) => {
    const values = normalizeChoiceValues(rawValues);
    return sku.trim() && values.length > 0 ? [[sku.trim(), values] as const] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function parseCatalogChoiceGroups(value: unknown): CatalogChoiceGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((group) => {
    if (!group || typeof group !== "object") return [];
    const raw = group as { key?: unknown; name?: unknown; required?: unknown; values?: unknown; valuesBySku?: unknown };
    const key = typeof raw.key === "string" ? normalizeChoiceKey(raw.key) : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const values = normalizeChoiceValues(raw.values);
    if (!key || !name || values.length === 0) return [];
    const valuesBySku = parseValuesBySku(raw.valuesBySku);
    return [{
      key,
      name,
      required: raw.required !== false,
      values,
      ...(valuesBySku ? { valuesBySku } : {}),
    }];
  });
}

export function catalogChoiceGroupsForSku(groups: CatalogChoiceGroup[], sku: string) {
  return groups.map((group) => ({
    ...group,
    values: group.valuesBySku?.[sku] || group.values,
  }));
}

export function catalogSelectionKey(selections: Record<string, string>) {
  return Object.entries(selections)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function validateCatalogSelections(rawValue: unknown, groups: CatalogChoiceGroup[]) {
  const raw = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : {};
  const allowed = new Set(groups.map((group) => group.key));

  for (const rawKey of Object.keys(raw)) {
    if (!allowed.has(normalizeChoiceKey(rawKey))) {
      throw Object.assign(new Error("Unknown product choice."), {
        code: "INVALID_SELECTION",
        status: 400,
      });
    }
  }

  const selections: Record<string, string> = {};
  for (const group of groups) {
    const sourceKey = Object.keys(raw).find((key) => normalizeChoiceKey(key) === group.key);
    const selected = sourceKey ? String(raw[sourceKey] ?? "").trim() : "";
    if (!selected) {
      if (group.required) {
        throw Object.assign(new Error(`${group.name} is required.`), {
          code: "SELECTION_REQUIRED",
          status: 400,
        });
      }
      continue;
    }
    if (!group.values.includes(selected)) {
      throw Object.assign(new Error(`Invalid ${group.name}.`), {
        code: "INVALID_SELECTION",
        status: 400,
      });
    }
    selections[group.key] = selected;
  }

  const selectionKey = catalogSelectionKey(selections);
  if (selectionKey.length > 500) {
    throw Object.assign(new Error("Product choice identity is too long."), {
      code: "INVALID_SELECTION",
      status: 400,
    });
  }
  return { selections, selectionKey };
}
