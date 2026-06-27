import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import { OrderEngineError } from "../orders/order-errors";
import type { RequestIdentity } from "./auth.identity";

export type CreateCustomerProfileInput = {
  name?: unknown;
  shopName?: unknown;
  contactName?: unknown;
  phone?: unknown;
  address?: unknown;
  area?: unknown;
  taxCode?: unknown;
  businessType?: unknown;
};

type CreatedCustomerRow = {
  id: string;
  name: string;
  shopName: string | null;
  contactName: string | null;
  phone: string;
  address: string | null;
  area: string | null;
  taxCode: string | null;
  businessType: string | null;
  approvalStatus: "pending";
  accountStatus: "active";
  createdAt: Date;
};

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new OrderEngineError(
      "INVALID_CUSTOMER_PROFILE",
      400,
      `${field} is required.`,
      { field },
    );
  }

  if (normalized.length > maxLength) {
    throw new OrderEngineError(
      "INVALID_CUSTOMER_PROFILE",
      400,
      `${field} is too long.`,
      { field, maxLength },
    );
  }

  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new OrderEngineError(
      "INVALID_CUSTOMER_PROFILE",
      400,
      `${field} must be a string.`,
      { field },
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new OrderEngineError(
      "INVALID_CUSTOMER_PROFILE",
      400,
      `${field} is too long.`,
      { field, maxLength },
    );
  }

  return normalized;
}

function requireUnmappedIdentity(identity: RequestIdentity): string {
  if (identity.kind === "anonymous") {
    throw new OrderEngineError(
      "AUTH_REQUIRED",
      401,
      "Authentication is required.",
    );
  }

  if (identity.kind === "staff") {
    throw new OrderEngineError(
      "CUSTOMER_ACCESS_ONLY",
      403,
      "Staff accounts cannot create customer profiles.",
    );
  }

  if (identity.kind === "customer") {
    throw new OrderEngineError(
      "CUSTOMER_PROFILE_ALREADY_EXISTS",
      409,
      "Customer profile already exists.",
    );
  }

  return identity.clerkUserId;
}

export async function createCustomerProfile(
  identity: RequestIdentity,
  input: CreateCustomerProfileInput,
  db: Pool = getDb(),
) {
  const clerkUserId = requireUnmappedIdentity(identity);

  const name = requiredText(input.name, "name", 200);
  const phone = requiredText(input.phone, "phone", 50);
  const shopName = optionalText(input.shopName, "shopName", 200);
  const contactName = optionalText(input.contactName, "contactName", 200);
  const address = optionalText(input.address, "address", 500);
  const area = optionalText(input.area, "area", 200);
  const taxCode = optionalText(input.taxCode, "taxCode", 100);
  const businessType = optionalText(
    input.businessType,
    "businessType",
    200,
  );

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
      [clerkUserId],
    );

    const existing = await client.query<{ customerId: string }>(
      `SELECT customer.id::text AS "customerId"
       FROM customers customer
       WHERE customer.clerk_user_id = $1

       UNION

       SELECT customer_user.customer_id::text AS "customerId"
       FROM customer_users customer_user
       WHERE customer_user.clerk_user_id = $1

       LIMIT 1`,
      [clerkUserId],
    );

    if (existing.rows[0]) {
      throw new OrderEngineError(
        "CUSTOMER_PROFILE_ALREADY_EXISTS",
        409,
        "Customer profile already exists.",
      );
    }

    const customerResult = await client.query<CreatedCustomerRow>(
      `INSERT INTO customers (
         clerk_user_id,
         name,
         shop_name,
         contact_name,
         phone,
         address,
         area,
         tax_code,
         business_type,
         approval_status,
         status
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         'pending',
         'active'
       )
       RETURNING
         id::text,
         name,
         shop_name AS "shopName",
         contact_name AS "contactName",
         phone,
         address,
         area,
         tax_code AS "taxCode",
         business_type AS "businessType",
         approval_status AS "approvalStatus",
         status AS "accountStatus",
         created_at AS "createdAt"`,
      [
        clerkUserId,
        name,
        shopName,
        contactName,
        phone,
        address,
        area,
        taxCode,
        businessType,
      ],
    );

    const customer = customerResult.rows[0];

    if (!customer) {
      throw new Error("Customer insert did not return a row.");
    }

    await client.query(
      `INSERT INTO customer_users (
         customer_id,
         clerk_user_id,
         role,
         is_primary
       )
       VALUES ($1, $2, 'owner', true)`,
      [customer.id, clerkUserId],
    );

    await client.query("COMMIT");

    return {
      customer,
      canViewWholesalePrice: false,
      canPlaceOrder: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new OrderEngineError(
        "CUSTOMER_PROFILE_ALREADY_EXISTS",
        409,
        "Customer profile already exists.",
      );
    }

    throw error;
  } finally {
    client.release();
  }
}
