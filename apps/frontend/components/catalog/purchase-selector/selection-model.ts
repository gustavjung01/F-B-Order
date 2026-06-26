import type {
  CatalogV2ChoiceGroup,
  CatalogV2DetailResponse,
  CatalogV2OptionGroup,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";

export type SelectionRow = {
  id: number;
  options: Record<string, string>;
  choices: Record<string, string>;
  quantity: number;
};

export type ResolvedSelectionRow = {
  row: SelectionRow;
  variant: CatalogV2VariantCard | null;
  choiceGroups: CatalogV2ChoiceGroup[];
  complete: boolean;
  label: string;
};

export function resolveVariant(detail: CatalogV2DetailResponse, options: Record<string, string>) {
  if (detail.optionGroups.length === 0) return detail.variants[0] || null;
  if (!detail.optionGroups.every((group) => Boolean(options[group.key]))) return null;
  return detail.variants.find((variant) => (
    detail.optionGroups.every((group) => variant.options[group.key] === options[group.key])
  )) || null;
}

export function availableValues(
  detail: CatalogV2DetailResponse,
  options: Record<string, string>,
  target: CatalogV2OptionGroup,
) {
  return target.values.filter((value) => detail.variants.some((variant) => (
    variant.options[target.key] === value
    && detail.optionGroups.every((group) => (
      group.key === target.key || !options[group.key] || variant.options[group.key] === options[group.key]
    ))
  )));
}

export function fillSingleOptionValues(detail: CatalogV2DetailResponse, source: Record<string, string>) {
  const next = { ...source };
  for (const group of detail.optionGroups) {
    if (next[group.key]) continue;
    const values = availableValues(detail, next, group);
    if (values.length === 1) next[group.key] = values[0];
  }
  return next;
}

export function choiceGroupsForVariant(
  groups: CatalogV2ChoiceGroup[],
  variant: CatalogV2VariantCard | null,
) {
  return groups.map((group) => ({
    ...group,
    values: variant ? group.valuesBySku?.[variant.sku] || group.values : group.values,
  }));
}

export function normalizeChoicesForVariant(
  current: Record<string, string>,
  groups: CatalogV2ChoiceGroup[],
  variant: CatalogV2VariantCard | null,
) {
  const activeGroups = choiceGroupsForVariant(groups, variant);
  const next: Record<string, string> = Object.fromEntries(
    Object.entries(current).filter(([key, value]) => (
      activeGroups.some((group) => group.key === key && group.values.includes(value))
    )),
  );
  for (const group of activeGroups) {
    if (!next[group.key] && group.values.length === 1) next[group.key] = group.values[0];
  }
  return next;
}

export function initialSelectionRow(
  detail: CatalogV2DetailResponse,
  groups: CatalogV2ChoiceGroup[],
  initialVariantId: string,
): SelectionRow {
  const firstVariant = detail.variants.find((item) => item.variant_id === initialVariantId) || detail.variants[0];
  const baseOptions = Object.fromEntries(
    detail.optionGroups
      .map((group) => [group.key, firstVariant?.options[group.key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])),
  );
  const options = fillSingleOptionValues(detail, baseOptions);
  const variant = resolveVariant(detail, options);
  return {
    id: 1,
    options,
    choices: normalizeChoicesForVariant({}, groups, variant),
    quantity: 1,
  };
}

function selectedPurchaseLabel(
  detail: CatalogV2DetailResponse,
  options: Record<string, string>,
  choices: Record<string, string>,
) {
  const optionValues = detail.optionGroups
    .map((group) => options[group.key])
    .filter((value): value is string => Boolean(value));
  const choiceValues = (detail.choiceGroups ?? [])
    .map((group) => choices[group.key])
    .filter((value): value is string => Boolean(value));
  return [...optionValues, ...choiceValues].join(" · ");
}

export function resolveRow(
  detail: CatalogV2DetailResponse,
  groups: CatalogV2ChoiceGroup[],
  row: SelectionRow,
): ResolvedSelectionRow {
  const variant = resolveVariant(detail, row.options);
  const choiceGroups = choiceGroupsForVariant(groups, variant);
  const complete = Boolean(variant)
    && choiceGroups.every((group) => !group.required || Boolean(row.choices[group.key]));
  return {
    row,
    variant,
    choiceGroups,
    complete,
    label: selectedPurchaseLabel(detail, row.options, row.choices),
  };
}

export function cartErrorText(status: number, code?: string) {
  if (status === 401 || code === "AUTH_REQUIRED") return "Bạn cần đăng nhập trước khi thêm giỏ.";
  if (code === "CUSTOMER_PROFILE_REQUIRED") return "Bạn cần tạo hồ sơ quán trước khi đặt hàng.";
  if (code === "CUSTOMER_NOT_APPROVED") return "Hồ sơ quán chưa được duyệt.";
  if (code === "SELECTION_REQUIRED") return "Chọn đủ phân loại trước khi thêm giỏ.";
  if (code === "INVALID_SELECTION") return "Lựa chọn phân loại không hợp lệ.";
  return "Không thêm được sản phẩm vào giỏ.";
}
