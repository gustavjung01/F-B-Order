import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import type { CustomerIdentity, RequestIdentity } from "../auth/auth.identity";
import { removeCatalogChoiceCartLine } from "./catalog-v2-choice-cart.service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function requireCustomer(identity: RequestIdentity): CustomerIdentity {
  if (identity.kind === "anonymous") throw Object.assign(new Error("Authentication required."), { code: "AUTH_REQUIRED", status: 401 });
  if (identity.kind === "unmapped") throw Object.assign(new Error("Customer profile required."), { code: "CUSTOMER_PROFILE_REQUIRED", status: 403 });
  if (identity.kind === "staff") throw Object.assign(new Error("Customer account required."), { code: "CUSTOMER_ACCESS_ONLY", status: 403 });
  if (identity.accountStatus !== "active") throw Object.assign(new Error("Customer account is not active."), { code: "CUSTOMER_INACTIVE", status: 403 });
  if (identity.approvalStatus !== "approved") throw Object.assign(new Error("Shop approval is required."), { code: "CUSTOMER_NOT_APPROVED", status: 403 });
  return identity;
}

function sendError(res: Response, error: unknown) {
  const typed = error as { code?: string; status?: number; message?: string };
  if (typed.code && typed.status) {
    res.status(typed.status).json({ error: typed.code, message: typed.message });
    return;
  }
  console.error("catalog choice cart delete failed", error);
  res.status(500).json({ error: "CATALOG_V2_CART_FAILED" });
}

export function createCatalogV2ChoiceCartDeleteRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.delete("/items/:variantId", async (req, res) => {
    try {
      const identity = requireCustomer(await identityResolver(req));
      const variantId = req.params.variantId.trim().toLowerCase();
      const selectionKey = typeof req.query.selection_key === "string" ? req.query.selection_key.trim() : "";
      if (!UUID_PATTERN.test(variantId) || selectionKey.length > 500) {
        return void res.status(400).json({ error: "INVALID_CART_ITEM_IDENTITY" });
      }
      const client = await getDb().connect();
      try {
        const result = await removeCatalogChoiceCartLine(client, {
          customerId: identity.customerId,
          variantId,
          selectionKey,
        });
        res.json({ variant_id: variantId, selectionKey, removed: (result.rowCount ?? 0) > 0 });
      } finally {
        client.release();
      }
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
