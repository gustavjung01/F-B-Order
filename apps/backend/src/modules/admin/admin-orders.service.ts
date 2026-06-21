import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertAdmin(identity: StaffIdentity): void {
  if (!identity.isActive || identity.role !== "admin") {
    throw new OrderEngineError("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
  }
}

function normalizeOrderId(orderId: string): string {
  const normalized = orderId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("INVALID_ORDER_ID", 400, "orderId must be a UUID.");
  }
  return normalized;
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
  if (!staff || staff.role !== "admin" || staff.is_active !== true) {
    throw new OrderEngineError("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
  }
}

export async function getAdminOrderDetail(
  identity: StaffIdentity,
  orderId: string,
  db: Pool | PoolClient = getDb(),
) {
  assertAdmin(identity);
  const id = normalizeOrderId(orderId);

  const orderResult = await db.query(
    `SELECT
       orders.id::text,
       orders.order_code AS "orderCode",
       orders.status,
       orders.currency,
       orders.subtotal::float8,
       orders.discount_total::float8 AS "discountTotal",
       orders.total_amount::float8 AS "totalAmount",
       orders.customer_note AS "customerNote",
       orders.internal_note AS "internalNote",
       orders.shipping_name AS "shippingName",
       orders.shipping_phone AS "shippingPhone",
       orders.shipping_address AS "shippingAddress",
       orders.submitted_at AS "submittedAt",
       orders.confirmed_at AS "confirmedAt",
       orders.cancelled_at AS "cancelledAt",
       orders.created_at AS "createdAt",
       orders.updated_at AS "updatedAt",
       customer.id::text AS "customerId",
       customer.name AS "customerName",
       customer.shop_name AS "shopName",
       customer.contact_name AS "contactName",
       customer.phone AS "customerPhone",
       customer.approval_status AS "customerApprovalStatus",
       customer.status AS "customerAccountStatus"
     FROM orders
     JOIN customers customer ON customer.id = orders.customer_id
     WHERE orders.id = $1`,
    [id],
  );
  const order = orderResult.rows[0];
  if (!order) {
    throw new OrderEngineError("ORDER_NOT_FOUND", 404, "Order was not found.");
  }

  const [itemsResult, statusLogsResult, noteLogsResult] = await Promise.all([
    db.query(
      `SELECT
         item.id::text,
         item.product_id::text AS "productId",
         item.sku,
         item.name,
         item.unit,
         item.product_type AS "productType",
         item.quantity::float8,
         item.unit_price::float8 AS "unitPrice",
         item.line_total::float8 AS "lineTotal",
         item.bundle_snapshot AS "bundleSnapshot",
         item.snapshot_version AS "snapshotVersion",
         item.created_at AS "createdAt"
       FROM order_items item
       WHERE item.order_id = $1
       ORDER BY item.created_at ASC, item.id ASC`,
      [id],
    ),
    db.query(
      `SELECT
         log.id::text,
         log.from_status AS "fromStatus",
         log.to_status AS "toStatus",
         log.actor_type AS "actorType",
         log.actor_id AS "actorId",
         COALESCE(staff.name, customer.name) AS "actorName",
         log.note,
         log.created_at AS "createdAt"
       FROM order_status_logs log
       LEFT JOIN staff_users staff ON staff.clerk_user_id = log.actor_id
       LEFT JOIN customer_users customer_user ON customer_user.clerk_user_id = log.actor_id
       LEFT JOIN customers customer ON customer.id = customer_user.customer_id
       WHERE log.order_id = $1
       ORDER BY log.created_at ASC, log.id ASC`,
      [id],
    ),
    db.query(
      `SELECT
         log.id::text,
         log.previous_note AS "previousNote",
         log.new_note AS "newNote",
         log.actor_type AS "actorType",
         log.actor_id AS "actorId",
         staff.name AS "actorName",
         log.created_at AS "createdAt"
       FROM order_internal_note_logs log
       LEFT JOIN staff_users staff ON staff.clerk_user_id = log.actor_id
       WHERE log.order_id = $1
       ORDER BY log.created_at DESC, log.id DESC`,
      [id],
    ),
  ]);

  return {
    order: {
      ...order,
      items: itemsResult.rows,
      statusLogs: statusLogsResult.rows,
      internalNoteLogs: noteLogsResult.rows,
    },
  };
}

export async function updateOrderInternalNote(
  identity: StaffIdentity,
  input: { orderId: string; note: unknown },
  db: Pool = getDb(),
) {
  assertAdmin(identity);
  const orderId = normalizeOrderId(input.orderId);
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > 4000) {
    throw new OrderEngineError(
      "ORDER_INTERNAL_NOTE_TOO_LONG",
      400,
      "Internal note cannot exceed 4000 characters.",
    );
  }
  const normalizedNote = note || null;
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await assertStoredAdmin(client, identity);

    const orderResult = await client.query<{ internal_note: string | null }>(
      `SELECT internal_note
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId],
    );
    const order = orderResult.rows[0];
    if (!order) {
      throw new OrderEngineError("ORDER_NOT_FOUND", 404, "Order was not found.");
    }

    await client.query(
      `UPDATE orders
       SET internal_note = $2, updated_at = now()
       WHERE id = $1`,
      [orderId, normalizedNote],
    );
    await client.query(
      `INSERT INTO order_internal_note_logs (
         order_id,
         previous_note,
         new_note,
         actor_type,
         actor_id
       ) VALUES ($1, $2, $3, 'staff', $4)`,
      [orderId, order.internal_note, normalizedNote, identity.clerkUserId],
    );

    await client.query("COMMIT");
    return getAdminOrderDetail(identity, orderId, db);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
