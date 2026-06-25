export const CART_STORAGE_KEY = "bep_si_fb_cart_variant_items_v4";
export const CART_UPDATED_EVENT = "bep-si-fb-cart-updated";

export type CartSelections = Record<string, string>;
export type CartItem = {
  variantId: string;
  quantity: number;
  selections: CartSelections;
  selectionKey: string;
};
export type AddCartItemInput = {
  variantId: string;
  quantity?: number;
  selections?: CartSelections;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function positiveInteger(value: unknown, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

function normalizeSelections(value: unknown): CartSelections {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => [key.trim(), typeof raw === "string" ? raw.trim() : ""])
      .filter(([key, selected]) => Boolean(key && selected))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function createCartSelectionKey(selections: CartSelections) {
  return Object.entries(normalizeSelections(selections))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function normalizeItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const rawVariantId = row.variantId ?? row.variant_id;
  const variantId = typeof rawVariantId === "string" ? rawVariantId.trim().toLowerCase() : "";
  if (!variantId) return null;
  const selections = normalizeSelections(row.selections);
  return {
    variantId,
    quantity: positiveInteger(row.quantity),
    selections,
    selectionKey: createCartSelectionKey(selections),
  };
}

function emitUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function readCartItems(): CartItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem).filter((item): item is CartItem => Boolean(item));
  } catch {
    return [];
  }
}

export function writeCartItems(items: CartItem[]) {
  if (!canUseStorage()) return;
  const payload = items.map(normalizeItem).filter((item): item is CartItem => Boolean(item)).map((item) => ({
    variant_id: item.variantId,
    quantity: item.quantity,
    selections: item.selections,
    selection_key: item.selectionKey,
  }));
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
  emitUpdated();
}

export function getCartItemKey(item: Pick<CartItem, "variantId" | "selectionKey">) {
  return `${item.variantId}::${item.selectionKey}`;
}

export function addCartItem(input: AddCartItemInput) {
  const next = normalizeItem({
    variantId: input.variantId,
    quantity: input.quantity ?? 1,
    selections: input.selections ?? {},
  });
  if (!next) return readCartItems();
  const items = readCartItems();
  const index = items.findIndex((item) => getCartItemKey(item) === getCartItemKey(next));
  if (index >= 0) items[index] = { ...next, quantity: items[index].quantity + next.quantity };
  else items.push(next);
  writeCartItems(items);
  return items;
}

export function updateCartItemQuantity(variantId: string, selectionKey: string, quantity: number) {
  const key = `${variantId}::${selectionKey}`;
  const safeQuantity = Math.floor(Number(quantity));
  const items = readCartItems();
  const next = Number.isFinite(safeQuantity) && safeQuantity > 0
    ? items.map((item) => getCartItemKey(item) === key ? { ...item, quantity: safeQuantity } : item)
    : items.filter((item) => getCartItemKey(item) !== key);
  writeCartItems(next);
  return next;
}

export function removeCartItem(variantId: string, selectionKey = "") {
  const key = `${variantId}::${selectionKey}`;
  const next = readCartItems().filter((item) => getCartItemKey(item) !== key);
  writeCartItems(next);
  return next;
}

export function clearCartItems() {
  writeCartItems([]);
}

export function getCartCount(items: CartItem[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}
