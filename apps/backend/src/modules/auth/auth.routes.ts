import type { Request } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import {
  resolveRequestIdentity,
  type RequestIdentity,
} from "./auth.identity";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;


type CustomerProfileRow = {
  id: string;
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

function toClientProfile(row: CustomerProfileRow) {
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

export function createAuthRouter(identityResolver: IdentityResolver = resolveRequestIdentity) {
  const authRouter = Router();

  authRouter.get("/me", async (req, res) => {
    try {
      const identity = await identityResolver(req);

      if (identity.kind === "anonymous") {
        res.status(401).json({ error: "AUTH_REQUIRED" });
        return;
      }

      if (identity.kind === "unmapped") {
        res.json({
          identityKind: identity.kind,
          clerkUserId: identity.clerkUserId,
          customerProfileRequired: true,
          canViewWholesalePrice: false,
          canPlaceOrder: false,
        });
        return;
      }

      if (identity.kind === "staff") {
        res.json({
          identityKind: identity.kind,
          clerkUserId: identity.clerkUserId,
          staffId: identity.staffId,
          role: identity.role,
          isActive: identity.isActive,
          canViewWholesalePrice: false,
          canPlaceOrder: false,
        });
        return;
      }

      const approvedAndActive =
        identity.approvalStatus === "approved" && identity.accountStatus === "active";

      res.json({
        identityKind: identity.kind,
        clerkUserId: identity.clerkUserId,
        customerId: identity.customerId,
        customerUserRole: identity.customerUserRole,
        approvalStatus: identity.approvalStatus,
        accountStatus: identity.accountStatus,
        canViewWholesalePrice: approvedAndActive,
        canPlaceOrder: approvedAndActive,
      });
    } catch (error) {
      console.error("auth identity resolution failed", error);
      res.status(503).json({ error: "IDENTITY_RESOLUTION_FAILED" });
    }
  });


  authRouter.get("/profile", async (req, res) => {
    try {
      const identity = await identityResolver(req);
      if (identity.kind === "anonymous") {
        res.status(401).json({ profile: null, error: "AUTH_REQUIRED" });
        return;
      }
      if (identity.kind === "staff") {
        res.status(403).json({ profile: null, error: "CUSTOMER_PROFILE_REQUIRED" });
        return;
      }

      const result = identity.kind === "customer"
        ? await getDb().query<CustomerProfileRow>(
            `SELECT * FROM customers WHERE id = $1 LIMIT 1`,
            [identity.customerId],
          )
        : await getDb().query<CustomerProfileRow>(
            `SELECT * FROM customers WHERE clerk_user_id = $1 LIMIT 1`,
            [identity.clerkUserId],
          );

      res.json({ profile: result.rows[0] ? toClientProfile(result.rows[0]) : null });
    } catch (error) {
      console.error("customer profile read failed", error);
      res.status(503).json({ error: "CUSTOMER_PROFILE_UNAVAILABLE" });
    }
  });

  authRouter.post("/profile", async (req, res) => {
    try {
      const identity = await identityResolver(req);
      if (identity.kind === "anonymous") {
        res.status(401).json({ error: "AUTH_REQUIRED" });
        return;
      }
      if (identity.kind === "staff") {
        res.status(403).json({ error: "CUSTOMER_PROFILE_REQUIRED" });
        return;
      }

      const body = (req.body || {}) as ProfilePayload;
      const shopName = clean(body.shopName);
      const contactName = clean(body.contactName);
      const phone = clean(body.phone);
      const address = clean(body.address);
      const taxCode = clean(body.taxCode) || null;
      const businessType = clean(body.businessType) || null;
      const note = clean(body.note) || null;

      if (!shopName || !contactName || !phone || !address) {
        res.status(400).json({ error: "MISSING_REQUIRED_FIELDS" });
        return;
      }

      const values = [shopName, contactName, phone, address, taxCode, businessType, note];
      const result = identity.kind === "customer"
        ? await getDb().query<CustomerProfileRow>(
            `UPDATE customers SET
              shop_name = $2,
              contact_name = $3,
              phone = $4,
              address = $5,
              tax_code = $6,
              business_type = $7,
              note = $8,
              approval_status = CASE
                WHEN approval_status = 'approved' THEN approval_status
                ELSE 'pending'
              END,
              rejected_reason = NULL,
              updated_at = now()
             WHERE id = $1
             RETURNING *`,
            [identity.customerId, ...values],
          )
        : await getDb().query<CustomerProfileRow>(
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
              rejected_reason = NULL,
              updated_at = now()
            RETURNING *`,
            [identity.clerkUserId, ...values],
          );

      if (!result.rows[0]) {
        res.status(404).json({ error: "CUSTOMER_PROFILE_NOT_FOUND" });
        return;
      }
      res.json({ profile: toClientProfile(result.rows[0]) });
    } catch (error) {
      console.error("customer profile update failed", error);
      res.status(503).json({ error: "CUSTOMER_PROFILE_UNAVAILABLE" });
    }
  });

  return authRouter;
}

export const authRouter = createAuthRouter();
