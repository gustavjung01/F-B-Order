import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db, type CustomerProfile } from "@/lib/db";

export const dynamic = "force-dynamic";

type UpdateBody = {
  customerId?: string;
  status?: "pending" | "approved" | "rejected";
  rejectedReason?: string;
};

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const result = await db.query<CustomerProfile>(
    `SELECT * FROM customers ORDER BY created_at DESC LIMIT 200`
  );

  return NextResponse.json({ customers: result.rows });
}

export async function PATCH(request: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as UpdateBody;
  if (!body.customerId || !body.status) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  if (!['pending', 'approved', 'rejected'].includes(body.status)) {
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
  }

  const result = await db.query<CustomerProfile>(
    `UPDATE customers SET
      approval_status = $2,
      approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END,
      rejected_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END
    WHERE id = $1
    RETURNING *`,
    [body.customerId, body.status, body.rejectedReason || null]
  );

  if (!result.rows[0]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ customer: result.rows[0] });
}
