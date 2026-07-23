import { getDb } from "../../db/pool.js";
import { OrderEngineError } from "../orders/order-errors.js";
import type { StaffIdentity } from "./auth.identity.js";

export type PermissionKey =
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
  | "production.plan.view"
  | "production.plan.analyze"
  | "recipe.rd.view"
  | "recipe.rd.create"
  | "recipe.rd.review"
  | "recipe.rd.apply"
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

const ALL_PERMISSIONS: PermissionKey[] = [
  "orders.view",
  "orders.update",
  "orders.internal_notes",
  "customers.view",
  "customers.update",
  "catalog.view",
  "catalog.edit",
  "catalog.publish",
  "catalog.pricing",
  "inventory.view",
  "suppliers.view",
  "kitchen.capacity.view",
  "kitchen.capacity.manage",
  "production.plan.view",
  "production.plan.analyze",
  "recipe.rd.view",
  "recipe.rd.create",
  "recipe.rd.review",
  "recipe.rd.apply",
  "recipes.view",
  "recipes.edit",
  "recipes.review",
  "recipes.publish",
  "recipes.media.manage",
  "staff.view",
  "staff.manage",
  "staff.roles.assign",
  "audit.view",
  "ai.use",
  "ai.execute",
  "ai.approve",
  "ai.configure",
  "ai.audit",
];

export async function listEffectivePermissions(identity: StaffIdentity): Promise<PermissionKey[]> {
  const db = getDb();

  try {
    const result = await db.query<{ permission_key: PermissionKey }>(
      `SELECT permission_key
       FROM staff_effective_permissions
       WHERE staff_user_id = $1
       ORDER BY permission_key`,
      [identity.staffId],
    );

    if (result.rows.length > 0) {
      return result.rows.map((row) => row.permission_key);
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "42P01" && code !== "42703") throw error;
  }

  return identity.role === "admin" ? [...ALL_PERMISSIONS] : [];
}

export function assertPermissionSet(
  permissions: readonly PermissionKey[],
  permission: PermissionKey,
): void {
  if (!permissions.includes(permission)) {
    throw new OrderEngineError(
      "PERMISSION_DENIED",
      403,
      `Missing required permission: ${permission}`,
      { permission },
    );
  }
}

export async function hasPermission(identity: StaffIdentity, permission: PermissionKey): Promise<boolean> {
  return (await listEffectivePermissions(identity)).includes(permission);
}

export async function requirePermission(
  identity: StaffIdentity,
  permission: PermissionKey,
): Promise<StaffIdentity> {
  assertPermissionSet(await listEffectivePermissions(identity), permission);
  return identity;
}
