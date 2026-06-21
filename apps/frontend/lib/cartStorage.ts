export const CART_STORAGE_KEY = "bep_si_fb_cart_items_v2";
export const CART_UPDATED_EVENT = "bep-si-fb-cart-updated";

export type CartItem = {
  productId: string;
  quantity: number;
};

export type AddCartItemInput = {
  productId: string;
  quantity?: number;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function toPositiveInteger(value: unknown, fallback = 1) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(1, Math.floor(numberValue));
}

function normalizeItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CartItem>;
  const productId = typeof item.productId === "string" ? item.productId.trim() : "";
  if (!productId) return null;
  return {
    productId,
    quantity: toPositiveInteger(item.quantity),
  };
}

function emitCartUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function readCartItems(): CartItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem).filter((item): item is CartItem => Boolean(item));
  } catch {
    return [];
  }
}

export function writeCartItems(items: CartItem[]) {
  if (!canUseStorage()) return;
  const normalized = items.map(normalizeItem).filter((item): item is CartItem => Boolean(item));
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalized));
  emitCartUpdated();
}

export function addCartItem(input: AddCartItemInput) {
  const nextItem = normalizeItem({
    productId: input.productId,
    quantity: input.quantity ?? 1,
  });
  if (!nextItem) return readCartItems();

  const items = readCartItems();
  const existingIndex = items.findIndex((item) => item.productId === nextItem.productId);
  if (existingIndex >= 0) {
    items[existingIndex] = {
      productId: nextItem.productId,
      quantity: items[existingIndex].quantity + nextItem.quantity,
    };
  } else {
    items.push(nextItem);
  }
  writeCartItems(items);
  return items;
}

export function updateCartItemQuantity(productId: string, quantity: number) {
  const items = readCartItems();
  const safeQuantity = Math.floor(Number(quantity));
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
    const filtered = items.filter((item) => item.productId !== productId);
    writeCartItems(filtered);
    return filtered;
  }

  const updated = items.map((item) => (
    item.productId === productId ? { ...item, quantity: safeQuantity } : item
  ));
  writeCartItems(updated);
  return updated;
}

export function removeCartItem(productId: string) {
  const items = readCartItems().filter((item) => item.productId !== productId);
  writeCartItems(items);
  return items;
}

export function clearCartItems() {
  writeCartItems([]);
}

export function getCartCount(items: CartItem[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function getCartItemKey(item: CartItem) {
  return item.productId;
}
