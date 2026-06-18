import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ORDER_STATUSES = ["draft", "submitted", "confirmed", "fulfilled", "cancelled"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

type UpdateBody = {
  orderId?: string;
  status?: OrderStatus;
};

type OrderRow = {
  order_id: string;
  order_code: string;
  status: OrderStatus;
  subtotal: string;
  note: string | null;
  submitted_at: string;
  confirmed_at: string | null;
  shop_name: string;
  contact_name: string;
  phone: string;
  address: string;
  item_id: string | null;
  sku: string | null;
  item_name: string | null;
  unit: string | null;
  quantity: number | null;
  unit_price: string | null;
  line_total: string | null;
};

type AdminOrderItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type AdminOrder = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  subtotal: number;
  note: string;
  submittedAt: string;
  confirmedAt: string | null;
  customer: {
    shopName: string;
    contactName: string;
    phone: string;
    address: string;
  };
  items: AdminOrderItem[];
};

type StatusRow = {
  status: OrderStatus;
};

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["confirmed", "cancelled"],
  confirmed: ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUSES.includes(value as OrderStatus);
}

function canTransition(from: OrderStatus, to: OrderStatus) {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function money(value: string | null) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function groupOrders(rows: OrderRow[]) {
  const orders = new Map<string, AdminOrder>();

  for (const row of rows) {
    if (!orders.has(row.order_id)) {
      orders.set(row.order_id, {
        id: row.order_id,
        orderCode: row.order_code,
        status: row.status,
        subtotal: money(row.subtotal),
        note: row.note || "",
        submittedAt: row.submitted_at,
        confirmedAt: row.confirmed_at,
        customer: {
          shopName: row.shop_name,
          contactName: row.contact_name,
          phone: row.phone,
          address: row.address,
        },
        items: [],
      });
    }

    if (row.item_id) {
      orders.get(row.order_id)?.items.push({
        id: row.item_id,
        sku: row.sku || "",
        name: row.item_name || "",
        unit: row.unit || "",
        quantity: row.quantity || 0,
        unitPrice: money(row.unit_price),
        lineTotal: money(row.line_total),
      });
    }
  }

  return Array.from(orders.values());
}

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const result = await db.query<OrderRow>(
    `SELECT
      o.id AS order_id,
      o.order_code,
      o.status,
      o.subtotal::text,
      o.note,
      o.submitted_at::text,
      o.confirmed_at::text,
      c.shop_name,
      c.contact_name,
      c.phone,
      c.address,
      oi.id AS item_id,
      oi.sku,
      oi.name AS item_name,
      oi.unit,
      oi.quantity,
      oi.unit_price::text,
      oi.line_total::text
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    ORDER BY o.submitted_at DESC, oi.name ASC
    LIMIT 500`
  );

  return NextResponse.json({ orders: groupOrders(result.rows) });
}

export async function PATCH(request: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as UpdateBody;
  if (!body.orderId || !isOrderStatus(body.status)) {
    return NextResponse.json({ error: "INVALID_FIELDS" }, { status: 400 });
  }

  const currentResult = await db.query<StatusRow>(`SELECT status FROM orders WHERE id = $1 LIMIT 1`, [body.orderId]);
  const currentStatus = currentResult.rows[0]?.status;
  if (!currentStatus) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (!canTransition(currentStatus, body.status)) {
    return NextResponse.json({ error: "INVALID_STATUS_TRANSITION", from: currentStatus, to: body.status }, { status: 409 });
  }

  const result = await db.query(
    `UPDATE orders SET
      status = $2,
      confirmed_at = CASE WHEN $2 = 'confirmed' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END
    WHERE id = $1
    RETURNING id, order_code, status, subtotal::text, note, submitted_at::text, confirmed_at::text, updated_at::text`,
    [body.orderId, body.status]
  );

  const order = result.rows[0];
  if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    order: {
      id: order.id,
      orderCode: order.order_code,
      status: order.status,
      subtotal: money(order.subtotal),
      note: order.note || "",
      submittedAt: order.submitted_at,
      confirmedAt: order.confirmed_at,
      updatedAt: order.updated_at,
    },
  });
}
