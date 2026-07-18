export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "delivering",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const USER_ROLES = ["customer", "admin", "staff"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PRODUCT_GROUPS = ["milk_tea", "spicy_noodle", "general", "promotion"] as const;

export type ProductGroup = (typeof PRODUCT_GROUPS)[number];

export * from "./recipe-domain";
