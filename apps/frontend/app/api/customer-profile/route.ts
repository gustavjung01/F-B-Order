import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, type CustomerProfile } from "@/lib/db";

export const dynamic = "force-dynamic";

type ProfilePayload = {
  shopName?: string;
  contactName?: string;
  phone?: string;
  address?: string;
  taxCode?: string;
  businessType?: string;
  note?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toClient(row: CustomerProfile) {
  return {
    id: row.id,
    shopName: row.shop_name,
    contactName: row.contact_name,
    phone: row.phone,
    address: row.address,
    taxCode: row.tax_code || "",
    businessType: row.business_type || "",
    note: row.note || "",
    approvalStatus: row.approval_status,
    rejectedReason: row.rejected_reason || "",
    salesOwner: row.sales_owner || "Bep Si F&B",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ profile: null }, { status: 401 });

  const result = await db.query<CustomerProfile>(
    `SELECT * FROM customers WHERE clerk_user_id = $1 LIMIT 1`,
    [userId]
  );

  return NextResponse.json({ profile: result.rows[0] ? toClient(result.rows[0]) : null });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as ProfilePayload;
  const shopName = clean(body.shopName);
  const contactName = clean(body.contactName);
  const phone = clean(body.phone);
  const address = clean(body.address);
  const taxCode = clean(body.taxCode) || null;
  const businessType = clean(body.businessType) || null;
  const note = clean(body.note) || null;

  if (!shopName || !contactName || !phone || !address) {
    return NextResponse.json({ error: "MISSING_REQUIRED_FIELDS" }, { status: 400 });
  }

  const result = await db.query<CustomerProfile>(
    `INSERT INTO customers (
      clerk_user_id, shop_name, contact_name, phone, address, tax_code, business_type, note, approval_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      shop_name = EXCLUDED.shop_name,
      contact_name = EXCLUDED.contact_name,
      phone = EXCLUDED.phone,
      address = EXCLUDED.address,
      tax_code = EXCLUDED.tax_code,
      business_type = EXCLUDED.business_type,
      note = EXCLUDED.note,
      approval_status = CASE
        WHEN customers.approval_status = 'approved' THEN customers.approval_status
        ELSE 'pending'
      END,
      rejected_reason = NULL
    RETURNING *`,
    [userId, shopName, contactName, phone, address, taxCode, businessType, note]
  );

  return NextResponse.json({ profile: toClient(result.rows[0]) });
}
