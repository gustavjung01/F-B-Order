import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;

if (!connectionString && process.env.NODE_ENV !== "production") {
  console.warn("DATABASE_URL is not configured. DB-backed API routes will fail until it is set.");
}

const globalForPg = globalThis as unknown as { bepsiPgPool?: Pool };

export const db = globalForPg.bepsiPgPool || new Pool({
  connectionString,
  ssl: connectionString?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 5,
});

if (process.env.NODE_ENV !== "production") globalForPg.bepsiPgPool = db;

export type CustomerProfile = {
  id: string;
  clerk_user_id: string;
  shop_name: string;
  contact_name: string;
  phone: string;
  address: string;
  tax_code: string | null;
  business_type: string | null;
  note: string | null;
  approval_status: "pending" | "approved" | "rejected";
  rejected_reason: string | null;
  sales_owner: string | null;
  created_at: string;
  updated_at: string;
};
