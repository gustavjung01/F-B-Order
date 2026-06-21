import type { Request, Response } from "express";
import { Router } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { isOrderEngineError, OrderEngineError } from "./order-errors";
import {
  createOrder,
  normalizeIdempotencyKey,
  normalizeOrderItems,
} from "./orders.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendOrderError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error("order request failed", error);
  res.status(500).json({ error: "ORDER_CREATE_FAILED" });
}

function requireCustomer(identity: RequestIdentity) {
  if (identity.kind === "anonymous") {
    throw new OrderEngineError("AUTH_REQUIRED", 401, "Authentication is required.");
  }
  if (identity.kind === "unmapped") {
    throw new OrderEngineError("CUSTOMER_PROFILE_REQUIRED", 403, "Customer profile is required.");
  }
  if (identity.kind === "staff") {
    throw new OrderEngineError("CUSTOMER_ACCESS_ONLY", 403, "Customer identity is required.");
  }
  return identity;
}

export function createOrdersRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const identity = requireCustomer(await identityResolver(req));
      const idempotencyKey = normalizeIdempotencyKey(req.header("idempotency-key"));
      const items = normalizeOrderItems(req.body?.items);
      const result = await createOrder({ identity, idempotencyKey, items });

      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      sendOrderError(res, error);
    }
  });

  return router;
}
