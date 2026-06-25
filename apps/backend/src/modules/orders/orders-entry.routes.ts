import type { Request, Response } from "express";
import { Router } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { createCatalogV2Order, normalizeCatalogV2OrderItems } from "./catalog-v2-orders.service";
import { isOrderEngineError, OrderEngineError } from "./order-errors";
import { createOrder, normalizeIdempotencyKey, normalizeOrderItems } from "./orders.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendOrderError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  console.error("order request failed", error);
  res.status(500).json({ error: "ORDER_CREATE_FAILED" });
}

function requireCustomer(identity: RequestIdentity) {
  if (identity.kind === "anonymous") throw new OrderEngineError("AUTH_REQUIRED", 401, "Authentication is required.");
  if (identity.kind === "unmapped") throw new OrderEngineError("CUSTOMER_PROFILE_REQUIRED", 403, "Customer profile is required.");
  if (identity.kind === "staff") throw new OrderEngineError("CUSTOMER_ACCESS_ONLY", 403, "Customer identity is required.");
  return identity;
}

function hasIdentityField(value: unknown, camel: string, snake: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row[camel] !== undefined || row[snake] !== undefined;
}

export function createOrderEntryRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const identity = requireCustomer(await identityResolver(req));
      const idempotencyKey = normalizeIdempotencyKey(req.header("idempotency-key"));
      const rawItems = req.body?.items;
      const rows = Array.isArray(rawItems) ? rawItems : [];
      const hasVariants = rows.some((item) => hasIdentityField(item, "variantId", "variant_id"));
      const hasProducts = rows.some((item) => hasIdentityField(item, "productId", "product_id"));

      if (hasVariants && hasProducts) {
        throw new OrderEngineError("MIXED_ORDER_ITEM_TYPES", 400, "An order cannot mix legacy products and catalog variants.");
      }

      const result = hasVariants
        ? await createCatalogV2Order({ identity, idempotencyKey, items: normalizeCatalogV2OrderItems(rawItems) })
        : await createOrder({ identity, idempotencyKey, items: normalizeOrderItems(rawItems) });

      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      sendOrderError(res, error);
    }
  });

  return router;
}
