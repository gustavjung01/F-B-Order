import { getAuth } from "@clerk/express";
import type { Request } from "express";
import type { Pool } from "pg";
import { getDb } from "../../db/pool";

export type CustomerApprovalStatus = "pending" | "approved" | "rejected";
export type CustomerAccountStatus = "active" | "inactive" | "blocked";

export type AnonymousIdentity = {
  kind: "anonymous";
  clerkUserId: null;
};

export type UnmappedIdentity = {
  kind: "unmapped";
  clerkUserId: string;
};

export type CustomerIdentity = {
  kind: "customer";
  clerkUserId: string;
  customerId: string;
  customerUserRole: "customer" | "owner" | "buyer";
  approvalStatus: CustomerApprovalStatus;
  accountStatus: CustomerAccountStatus;
  priceGroupId: string | null;
};

export type StaffIdentity = {
  kind: "staff";
  clerkUserId: string;
  staffId: string;
  role: "admin" | "staff";
  isActive: boolean;
};

export type RequestIdentity = AnonymousIdentity | UnmappedIdentity | CustomerIdentity | StaffIdentity;

export const anonymousIdentity: AnonymousIdentity = Object.freeze({
  kind: "anonymous",
  clerkUserId: null,
});

type IdentityRow = {
  identity_kind: "customer" | "staff";
  entity_id: string;
  role: string;
  approval_status: CustomerApprovalStatus | null;
  account_status: CustomerAccountStatus | null;
  price_group_id: string | null;
  is_active: boolean | null;
};

export async function resolveIdentityByClerkUserId(
  clerkUserId: string,
  db: Pick<Pool, "query"> = getDb(),
): Promise<RequestIdentity> {
  const normalizedUserId = clerkUserId.trim();
  if (!normalizedUserId) return anonymousIdentity;

  const result = await db.query<IdentityRow>(
    `WITH customer_match AS (
       SELECT
         'customer'::text AS identity_kind,
         customer.id::text AS entity_id,
         COALESCE(customer_user.role, 'customer')::text AS role,
         customer.approval_status::text AS approval_status,
         customer.status::text AS account_status,
         customer.price_group_id::text AS price_group_id,
         NULL::boolean AS is_active,
         CASE WHEN customer_user.id IS NOT NULL THEN 0 ELSE 1 END AS match_priority
       FROM customers customer
       LEFT JOIN customer_users customer_user
         ON customer_user.customer_id = customer.id
        AND customer_user.clerk_user_id = $1
       WHERE customer_user.clerk_user_id = $1
          OR customer.clerk_user_id = $1
       ORDER BY match_priority
       LIMIT 1
     ),
     staff_match AS (
       SELECT
         'staff'::text AS identity_kind,
         staff.id::text AS entity_id,
         staff.role::text AS role,
         NULL::text AS approval_status,
         NULL::text AS account_status,
         NULL::text AS price_group_id,
         staff.is_active,
         0 AS match_priority
       FROM staff_users staff
       WHERE staff.clerk_user_id = $1
       LIMIT 1
     )
     SELECT identity_kind, entity_id, role, approval_status, account_status, price_group_id, is_active
     FROM staff_match
     UNION ALL
     SELECT identity_kind, entity_id, role, approval_status, account_status, price_group_id, is_active
     FROM customer_match
     LIMIT 1`,
    [normalizedUserId],
  );

  const row = result.rows[0];
  if (!row) {
    return { kind: "unmapped", clerkUserId: normalizedUserId };
  }

  if (row.identity_kind === "staff") {
    return {
      kind: "staff",
      clerkUserId: normalizedUserId,
      staffId: row.entity_id,
      role: row.role === "admin" ? "admin" : "staff",
      isActive: row.is_active === true,
    };
  }

  return {
    kind: "customer",
    clerkUserId: normalizedUserId,
    customerId: row.entity_id,
    customerUserRole:
      row.role === "owner" || row.role === "buyer" ? row.role : "customer",
    approvalStatus:
      row.approval_status === "approved" || row.approval_status === "rejected"
        ? row.approval_status
        : "pending",
    accountStatus:
      row.account_status === "inactive" || row.account_status === "blocked"
        ? row.account_status
        : "active",
    priceGroupId: row.price_group_id,
  };
}

export async function resolveRequestIdentity(req: Request): Promise<RequestIdentity> {
  const auth = getAuth(req);
  if (!auth.userId) return anonymousIdentity;
  return resolveIdentityByClerkUserId(auth.userId);
}
