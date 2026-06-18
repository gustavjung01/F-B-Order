import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OrderItemPayload = {
  productId?: string;
  quantity?: number;
};

type CreateOrderPayload = {
  items?: OrderItemPayload[];
  note?: string;
};

type CustomerRow = {
  id: string;
  approval_status: "pending" | "approved" | "rejected";
};

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  wholesale_price: string;
  min_order_qty: number;
};

type CreatedOrderRow = {
  id: string;
  order_code: string;
  status: string;
  subtotal: string;
  submitted_at: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createOrderCode() {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BSI-${datePart}-${timePart}-${randomPart}`;
}

function normalizeItems(items: unknown) {
  if (!Array.isArray(items)) return [];

  const byProductId = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const payload = item as OrderItemPayload;
    const productId = clean(payload.productId);
    const quantity = Math.floor(Number(payload.quantity));

    if (!UUID_RE.test(productId) || !Number.isFinite(quantity) || quantity <= 0) continue;
    byProductId.set(productId, (byProductId.get(productId) || 0) + quantity);
  }

  return Array.from(byProductId.entries()).map(([productId, quantity]) => ({ productId, quantity }));
}

function moneyToNumber(value: string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as CreateOrderPayload;
  const items = normalizeItems(body.items);
  const note = clean(body.note).slice(0, 1000) || null;

  if (items.length === 0) {
    return NextResponse.json({ error: "EMPTY_ORDER" }, { status: 400 });
  }

  if (items.length > 100) {
    return NextResponse.json({ error: "TOO_MANY_ITEMS" }, { status: 400 });
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const customerResult = await client.query<CustomerRow>(
      `SELECT id, approval_status FROM customers WHERE clerk_user_id = $1 LIMIT 1`,
      [userId]
    );
    const customer = customerResult.rows[0];

    if (!customer) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "CUSTOMER_PROFILE_REQUIRED" }, { status: 403 });
    }

    if (customer.approval_status !== "approved") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "CUSTOMER_NOT_APPROVED" }, { status: 403 });
    }

    const productIds = items.map((item) => item.productId);
    const productResult = await client.query<ProductRow>(
      `SELECT id, sku, name, unit, wholesale_price::text, min_order_qty
       FROM products
       WHERE id = ANY($1::uuid[]) AND status = 'active'`,
      [productIds]
    );

    const productById = new Map(productResult.rows.map((product) => [product.id, product]));

    if (productById.size !== productIds.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "PRODUCT_NOT_FOUND_OR_INACTIVE" }, { status: 400 });
    }

    const orderItems = items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) throw new Error("PRODUCT_NOT_FOUND_OR_INACTIVE");
      if (item.quantity < product.min_order_qty) {
        throw new Error(`QUANTITY_BELOW_MIN:${product.sku}:${product.min_order_qty}`);
      }

      const unitPrice = moneyToNumber(product.wholesale_price);
      const lineTotal = unitPrice * item.quantity;

      return {
        product,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      };
    });

    const subtotal = orderItems.reduce((total, item) => total + item.lineTotal, 0);
    const orderCode = createOrderCode();

    const orderResult = await client.query<CreatedOrderRow>(
      `INSERT INTO orders (order_code, customer_id, status, subtotal, note)
       VALUES ($1, $2, 'submitted', $3, $4)
       RETURNING id, order_code, status, subtotal::text, submitted_at::text`,
      [orderCode, customer.id, subtotal, note]
    );
    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, sku, name, unit, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          order.id,
          item.product.id,
          item.product.sku,
          item.product.name,
          item.product.unit,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
        ]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      order: {
        id: order.id,
        orderCode: order.order_code,
        status: order.status,
        subtotal: moneyToNumber(order.subtotal),
        submittedAt: order.submitted_at,
        itemCount: orderItems.reduce((total, item) => total + item.quantity, 0),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    if (error instanceof Error && error.message.startsWith("QUANTITY_BELOW_MIN:")) {
      const [, sku, minQty] = error.message.split(":");
      return NextResponse.json({ error: "QUANTITY_BELOW_MIN", sku, minQty: Number(minQty) }, { status: 400 });
    }

    console.error("Create order failed", error);
    return NextResponse.json({ error: "CREATE_ORDER_FAILED" }, { status: 500 });
  } finally {
    client.release();
  }
}
