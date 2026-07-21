import { notifyCustomerApprovalChanged, runPushTask } from "../notifications/onesignal.service";
import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;

type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

type CustomerLockRow = {
  id: string;
  approval_status: ApprovalStatus;
};

function assertActiveStaff(identity: StaffIdentity): void {
  if (!identity.isActive) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required.");
  }
}

function normalizeCustomerId(customerId: string): string {
  const normalized = customerId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("INVALID_CUSTOMER_ID", 400, "customerId must be a UUID.");
  }
  return normalized;
}

function normalizeApprovalStatus(value: unknown): ApprovalStatus | null {
  return typeof value === "string" && APPROVAL_STATUSES.includes(value as ApprovalStatus)
    ? (value as ApprovalStatus)
    : null;
}

function normalizeDecisionNote(status: "approved" | "rejected", value: unknown): string | null {
  const note = typeof value === "string" ? value.trim() : "";
  if (note.length > 2000) {
    throw new OrderEngineError(
      "CUSTOMER_APPROVAL_NOTE_TOO_LONG",
      400,
      "Approval note cannot exceed 2000 characters.",
    );
  }
  if (status === "rejected" && note.length === 0) {
    throw new OrderEngineError(
      "CUSTOMER_REJECTION_NOTE_REQUIRED",
      400,
      "A rejection reason is required.",
    );
  }
  return note || null;
}

async function assertStoredAdmin(client: PoolClient, identity: StaffIdentity): Promise<void> {
  const result = await client.query<{ role: string; is_active: boolean }>(
    `SELECT role, is_active
     FROM staff_users
     WHERE id = $1
     FOR SHARE`,
    [identity.staffId],
  );
  const staff = result.rows[0];
  if (!staff || staff.is_active !== true) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required.");
  }
}

export async function listAdminCustomers(
  identity: StaffIdentity,
  input: { approvalStatus?: unknown; search?: unknown; limit?: number } = {},
  db: Pool = getDb(),
) {
  assertActiveStaff(identity);
  const approvalStatus = input.approvalStatus
    ? normalizeApprovalStatus(input.approvalStatus)
    : null;
  if (input.approvalStatus && !approvalStatus) {
    throw new OrderEngineError("INVALID_APPROVAL_STATUS", 400, "Unknown approval status.");
  }

  const search = typeof input.search === "string" ? input.search.trim() : "";
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), 100);
  const values: unknown[] = [];
  const clauses: string[] = [];

  if (approvalStatus) {
    values.push(approvalStatus);
    clauses.push(`customer.approval_status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(
      customer.name ILIKE $${values.length}
      OR COALESCE(customer.shop_name, '') ILIKE $${values.length}
      OR COALESCE(customer.contact_name, '') ILIKE $${values.length}
      OR COALESCE(customer.phone, '') ILIKE $${values.length}
    )`);
  }
  values.push(limit);

  const result = await db.query(
    `SELECT
       customer.id::text,
       customer.name,
       customer.shop_name AS "shopName",
       customer.contact_name AS "contactName",
       customer.phone,
       customer.area,
       customer.approval_status AS "approvalStatus",
       customer.status AS "accountStatus",
       customer.approval_note AS "approvalNote",
       customer.approval_decided_by_actor_type AS "approvalActorType",
       customer.approval_decided_by_actor_id AS "approvalActorId",
       customer.approval_decided_at AS "approvalDecidedAt",
       customer.created_at AS "createdAt",
       customer.updated_at AS "updatedAt",
       price_group.code AS "priceGroupCode",
       price_group.name AS "priceGroupName",
       COUNT(customer_user.id)::int AS "userCount",
       COUNT(*) OVER()::int AS "totalCount"
     FROM customers customer
     LEFT JOIN price_groups price_group ON price_group.id = customer.price_group_id
     LEFT JOIN customer_users customer_user ON customer_user.customer_id = customer.id
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     GROUP BY customer.id, price_group.id
     ORDER BY
       CASE customer.approval_status
         WHEN 'pending' THEN 0
         WHEN 'rejected' THEN 1
         ELSE 2
       END,
       customer.created_at DESC,
       customer.id DESC
     LIMIT $${values.length}`,
    values,
  );

  return {
    customers: result.rows.map(({ totalCount: _totalCount, ...customer }) => customer),
    total: Number(result.rows[0]?.totalCount ?? 0),
  };
}

export async function getAdminCustomerDetail(
  identity: StaffIdentity,
  customerId: string,
  db: Pool | PoolClient = getDb(),
) {
  assertActiveStaff(identity);
  const id = normalizeCustomerId(customerId);

  const customerResult = await db.query(
    `SELECT
       customer.id::text,
       customer.clerk_user_id AS "legacyClerkUserId",
       customer.name,
       customer.shop_name AS "shopName",
       customer.contact_name AS "contactName",
       customer.phone,
       customer.address,
       customer.area,
       customer.tax_code AS "taxCode",
       customer.business_type AS "businessType",
       customer.note,
       customer.approval_status AS "approvalStatus",
       customer.status AS "accountStatus",
       customer.approval_note AS "approvalNote",
       customer.rejected_reason AS "rejectedReason",
       customer.approval_decided_by_actor_type AS "approvalActorType",
       customer.approval_decided_by_actor_id AS "approvalActorId",
       customer.approval_decided_at AS "approvalDecidedAt",
       customer.created_at AS "createdAt",
       customer.updated_at AS "updatedAt",
       price_group.id::text AS "priceGroupId",
       price_group.code AS "priceGroupCode",
       price_group.name AS "priceGroupName"
     FROM customers customer
     LEFT JOIN price_groups price_group ON price_group.id = customer.price_group_id
     WHERE customer.id = $1`,
    [id],
  );
  const customer = customerResult.rows[0];
  if (!customer) {
    throw new OrderEngineError("CUSTOMER_NOT_FOUND", 404, "Customer was not found.");
  }

  const [usersResult, logsResult] = await Promise.all([
    db.query(
      `SELECT
         customer_user.id::text,
         customer_user.clerk_user_id AS "clerkUserId",
         customer_user.role,
         customer_user.is_primary AS "isPrimary",
         customer_user.created_at AS "createdAt"
       FROM customer_users customer_user
       WHERE customer_user.customer_id = $1
       ORDER BY customer_user.is_primary DESC, customer_user.created_at ASC`,
      [id],
    ),
    db.query(
      `SELECT
         log.id::text,
         log.from_status AS "fromStatus",
         log.to_status AS "toStatus",
         log.actor_type AS "actorType",
         log.actor_id AS "actorId",
         staff.name AS "actorName",
         log.note,
         log.created_at AS "createdAt"
       FROM customer_approval_logs log
       LEFT JOIN staff_users staff ON staff.clerk_user_id = log.actor_id
       WHERE log.customer_id = $1
       ORDER BY log.created_at DESC, log.id DESC`,
      [id],
    ),
  ]);

  return {
    customer: {
      ...customer,
      users: usersResult.rows,
      approvalLogs: logsResult.rows,
    },
  };
}

export async function decideCustomerApproval(
  identity: StaffIdentity,
  input: { customerId: string; status: unknown; note?: unknown },
  db: Pool = getDb(),
) {
  assertActiveStaff(identity);
  const customerId = normalizeCustomerId(input.customerId);
  const status = normalizeApprovalStatus(input.status);
  if (status !== "approved" && status !== "rejected") {
    throw new OrderEngineError(
      "INVALID_APPROVAL_DECISION",
      400,
      "Approval decision must be approved or rejected.",
    );
  }
  const note = normalizeDecisionNote(status, input.note);
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);

    const customerResult = await client.query<CustomerLockRow>(
      `SELECT id::text, approval_status
       FROM customers
       WHERE id = $1
       FOR UPDATE`,
      [customerId],
    );
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new OrderEngineError("CUSTOMER_NOT_FOUND", 404, "Customer was not found.");
    }
    if (customer.approval_status === status) {
      throw new OrderEngineError(
        "CUSTOMER_APPROVAL_UNCHANGED",
        409,
        `Customer is already ${status}.`,
      );
    }

    await client.query(
      `UPDATE customers
       SET
         approval_status = $2,
         approval_decided_by_actor_type = 'staff',
         approval_decided_by_actor_id = $3,
         approval_decided_at = now(),
         approval_note = $4,
         rejected_reason = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
         updated_at = now()
       WHERE id = $1`,
      [customerId, status, identity.clerkUserId, note],
    );

    await client.query(
      `INSERT INTO customer_approval_logs (
         customer_id,
         from_status,
         to_status,
         actor_type,
         actor_id,
         note
       ) VALUES ($1, $2, $3, 'staff', $4, $5)`,
      [customerId, customer.approval_status, status, identity.clerkUserId, note],
    );

    await client.query("COMMIT");

    runPushTask("customer approval", () => notifyCustomerApprovalChanged({
      customerId,
      status,
      note,
    }));

    return getAdminCustomerDetail(identity, customerId, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
