import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

export function requireAdmin(identity: RequestIdentity): StaffIdentity {
  if (identity.kind === "anonymous") {
    throw new OrderEngineError("AUTH_REQUIRED", 401, "Authentication is required.");
  }
  if (identity.kind !== "staff") {
    throw new OrderEngineError("ADMIN_ACCESS_REQUIRED", 403, "Admin access is required.");
  }
  if (!identity.isActive) {
    throw new OrderEngineError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  }
  if (identity.role !== "admin") {
    throw new OrderEngineError("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
  }
  return identity;
}
