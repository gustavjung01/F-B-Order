export const CART_STORAGE_KEY = "bep_si_fb_cart_items_v1";
export const CART_UPDATED_EVENT = "bep-si-fb-cart-updated";

export type CartItem = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  minOrderQty: number;
  imageUrl: string;
  categorySlug: string;
};

export type AddCartItemInput = Omit<CartItem, "quantity"> & {
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
  const productId = String(item.productId || "");
  const sku = String(item.sku || "");
  const name = String(item.name || "");
  const unit = String(item.unit || "");
  const price = Number(item.price);

  if (!productId && !sku) return null;
  if (!name || !unit) return null;
  if (!Number.isFinite(price) || price < 0) return null;

  return {
    productId,
    sku,
    name,
    unit,
    price,
    quantity: toPositiveInteger(item.quantity),
    minOrderQty: toPositiveInteger(item.minOrderQty),
    imageUrl: String(item.imageUrl || ""),
    categorySlug: String(item.categorySlug || ""),
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
  } catch (error) {
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
  const quantityToAdd = toPositiveInteger(input.quantity, input.minOrderQty || 1);
  const nextItem = normalizeItem({ ...input, quantity: quantityToAdd });
  if (!nextItem) return readCartItems();

  const items = readCartItems();
  const itemKey = nextItem.productId || nextItem.sku;
  const existingIndex = items.findIndex((item) => (item.productId || item.sku) === itemKey);

  if (existingIndex >= 0) {
    items[existingIndex] = {
      ...items[existingIndex],
      ...nextItem,
      quantity: items[existingIndex].quantity + quantityToAdd,
    };
  } else {
    items.push(nextItem);
  }

  writeCartItems(items);
  return items;
}

export function updateCartItemQuantity(itemKey: string, quantity: number) {
  const items = readCartItems();
  const safeQuantity = Math.floor(Number(quantity));

  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
    const filtered = items.filter((item) => (item.productId || item.sku) !== itemKey);
    writeCartItems(filtered);
    return filtered;
  }

  const updated = items.map((item) => {
    if ((item.productId || item.sku) !== itemKey) return item;
    return { ...item, quantity: Math.max(item.minOrderQty || 1, safeQuantity) };
  });

  writeCartItems(updated);
  return updated;
}

export function removeCartItem(itemKey: string) {
  const items = readCartItems().filter((item) => (item.productId || item.sku) !== itemKey);
  writeCartItems(items);
  return items;
}

export function clearCartItems() {
  writeCartItems([]);
}

export function getCartCount(items: CartItem[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function getCartTotal(items: CartItem[]) {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}
