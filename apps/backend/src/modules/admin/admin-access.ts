import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity.js";
import { OrderEngineError } from "../orders/order-errors.js";

export type AdminStaffIdentity = StaffIdentity;

/**
 * @deprecated Authorization belongs at the route boundary through requirePermission().
 * This helper now only guarantees an active staff identity for legacy services.
 */
export function requireAdmin(identity: RequestIdentity): AdminStaffIdentity {
  if (identity.kind !== "staff" || !identity.isActive) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required");
  }
  return identity;
}
