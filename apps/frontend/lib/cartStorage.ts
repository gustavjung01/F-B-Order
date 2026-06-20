export const CART_STORAGE_KEY = "bep_si_fb_cart_items_v1";
export const CART_UPDATED_EVENT = "bep-si-fb-cart-updated";

export type CartItemSnapshot = {
  productName: string;
  sku: string;
  unit: string;
  unitLabel: string;
  packageSize: string;
  packageSizeLabel: string;
  priceLabel: string;
  imageUrl: string;
  categorySlug: string;
  categoryName: string;
};

export type CartItem = CartItemSnapshot & {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  minOrderQty: number;
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

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CartItem>;
  const productId = cleanText(item.productId);
  const sku = cleanText(item.sku);
  const name = cleanText(item.name || item.productName);
  const productName = cleanText(item.productName || item.name);
  const unit = cleanText(item.unit || item.unitLabel);
  const unitLabel = cleanText(item.unitLabel || item.unit);
  const packageSize = cleanText(item.packageSize || item.packageSizeLabel);
  const packageSizeLabel = cleanText(item.packageSizeLabel || item.packageSize);
  const priceLabel = cleanText(item.priceLabel);
  const price = Number(item.price);

  if (!productId && !sku) return null;
  if (!name || !productName || !unit) return null;
  if (!Number.isFinite(price) || price < 0) return null;

  return {
    productId,
    sku,
    name,
    productName,
    unit,
    unitLabel: unitLabel || unit,
    packageSize,
    packageSizeLabel,
    priceLabel,
    price,
    quantity: toPositiveInteger(item.quantity),
    minOrderQty: toPositiveInteger(item.minOrderQty),
    imageUrl: cleanText(item.imageUrl),
    categorySlug: cleanText(item.categorySlug),
    categoryName: cleanText(item.categoryName),
  };
}

function getItemKey(item: Pick<CartItem, "productId" | "sku" | "packageSizeLabel" | "unitLabel">) {
  return [item.productId || item.sku, item.packageSizeLabel, item.unitLabel].filter(Boolean).join("::");
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
  const itemKey = getItemKey(nextItem);
  const existingIndex = items.findIndex((item) => getItemKey(item) === itemKey);

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
    const filtered = items.filter((item) => getItemKey(item) !== itemKey);
    writeCartItems(filtered);
    return filtered;
  }

  const updated = items.map((item) => {
    if (getItemKey(item) !== itemKey) return item;
    return { ...item, quantity: Math.max(item.minOrderQty || 1, safeQuantity) };
  });

  writeCartItems(updated);
  return updated;
}

export function removeCartItem(itemKey: string) {
  const items = readCartItems().filter((item) => getItemKey(item) !== itemKey);
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

export function getCartItemKey(item: CartItem) {
  return getItemKey(item);
}
