"use client";

import { useMemo, useRef, useState } from "react";
import type { CatalogV2ChoiceGroup, CatalogV2DetailResponse, CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import { groupPurchases } from "./cart-sync";
import {
  availableValues,
  fillSingleOptionValues,
  initialSelectionRow,
  normalizeChoicesForVariant,
  resolveRow,
  resolveVariant,
  type ResolvedSelectionRow,
  type SelectionRow,
} from "./selection-model";

export function usePurchaseRowState(
  detail: CatalogV2DetailResponse,
  initialVariantId: string,
  onVariantChange?: (variant: CatalogV2VariantCard) => void,
) {
  const choiceGroups: CatalogV2ChoiceGroup[] = detail.choiceGroups ?? [];
  const nextRowId = useRef(2);
  const [rows, setRows] = useState<SelectionRow[]>([initialSelectionRow(detail, choiceGroups, initialVariantId)]);
  const [openControlKey, setOpenControlKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const resolvedRows = useMemo(() => rows.map((row) => resolveRow(detail, choiceGroups, row)), [choiceGroups, detail, rows]);
  const completeRows = resolvedRows.filter((item): item is ResolvedSelectionRow & { variant: CatalogV2VariantCard } => item.complete && Boolean(item.variant));
  const groupedItems = groupPurchases(completeRows);
  const totalQuantity = completeRows.reduce((total, item) => total + item.row.quantity, 0);

  function updateOption(rowId: number, groupIndex: number, key: string, value: string) {
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    const currentRow = rows[rowIndex];
    if (!currentRow) return;
    const options = { ...currentRow.options, [key]: value };
    for (let index = groupIndex + 1; index < detail.optionGroups.length; index += 1) {
      const group = detail.optionGroups[index];
      const values = availableValues(detail, options, group);
      if (!options[group.key] || !values.includes(options[group.key])) {
        if (values.length === 1) options[group.key] = values[0];
        else delete options[group.key];
      }
    }
    const variant = resolveVariant(detail, options);
    const nextRow: SelectionRow = { ...currentRow, options, choices: normalizeChoicesForVariant(currentRow.choices, choiceGroups, variant) };
    setRows((current) => current.map((row) => row.id === rowId ? nextRow : row));
    setOpenControlKey(null);
    if (rowIndex === 0 && variant) onVariantChange?.(variant);
    setMessage("");
  }

  function updateChoice(rowId: number, key: string, value: string) {
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, choices: { ...row.choices, [key]: value } } : row));
    setOpenControlKey(null);
    setMessage("");
  }

  function updateQuantity(rowId: number, quantity: number) {
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, quantity: Math.max(1, quantity) } : row));
    setMessage("");
  }

  function removeRow(rowId: number) {
    setRows((current) => current.filter((row) => row.id !== rowId));
    setOpenControlKey(null);
    setMessage("");
  }

  function addSelectionRow() {
    const last = resolvedRows[resolvedRows.length - 1];
    if (!last?.complete) return setMessage("Chọn đủ phân loại ở dòng hiện tại trước khi thêm dòng mới.");
    const firstGroup = detail.optionGroups[0];
    const kept = firstGroup && last.row.options[firstGroup.key] ? { [firstGroup.key]: last.row.options[firstGroup.key] } : {};
    const options = fillSingleOptionValues(detail, kept);
    const variant = resolveVariant(detail, options);
    setRows((current) => [...current, {
      id: nextRowId.current++,
      options,
      choices: normalizeChoicesForVariant({}, choiceGroups, variant),
      quantity: 1,
    }]);
    setOpenControlKey(null);
    setMessage("");
  }

  return {
    rows, resolvedRows, completeRows, groupedItems, totalQuantity,
    hasSelectableGroups: detail.optionGroups.length > 0 || choiceGroups.length > 0,
    openControlKey, setOpenControlKey, message, setMessage,
    updateOption, updateChoice, updateQuantity, removeRow, addSelectionRow,
  };
}
