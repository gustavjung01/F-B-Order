export type AdminPermission =
  | "orders.view"
  | "orders.update"
  | "orders.internal_notes"
  | "customers.view"
  | "customers.update"
  | "catalog.view"
  | "catalog.edit"
  | "catalog.publish"
  | "catalog.pricing"
  | "inventory.view"
  | "suppliers.view"
  | "kitchen.capacity.view"
  | "kitchen.capacity.manage"
  | "recipes.view"
  | "recipes.edit"
  | "recipes.review"
  | "recipes.publish"
  | "recipes.media.manage"
  | "staff.view"
  | "staff.manage"
  | "staff.roles.assign"
  | "audit.view"
  | "ai.use"
  | "ai.execute"
  | "ai.approve"
  | "ai.configure"
  | "ai.audit";

export const ADMIN_ENTRY_PERMISSIONS: readonly AdminPermission[] = [
  "orders.view",
  "customers.view",
  "catalog.view",
  "inventory.view",
  "suppliers.view",
  "kitchen.capacity.view",
  "recipes.view",
  "staff.view",
  "audit.view",
  "ai.use",
  "ai.approve",
];

export function hasAdminPermission(
  permissions: readonly string[],
  permission: AdminPermission,
): boolean {
  return permissions.includes(permission);
}

export function hasAnyAdminPermission(
  permissions: readonly string[],
  required: readonly AdminPermission[],
): boolean {
  return required.some((permission) => permissions.includes(permission));
}
