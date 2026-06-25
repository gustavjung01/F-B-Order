import type { Request, Response } from "express";
import { Router } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { isOrderEngineError, OrderEngineError } from "./order-errors";
import { listCustomerOrdersV2 } from "./customer-orders-v2.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function requireCustomer(identity: RequestIdentity) {
  if (identity.kind === "anonymous") throw new OrderEngineError("AUTH_REQUIRED", 401, "Authentication is required.");
  if (identity.kind === "unmapped") throw new OrderEngineError("CUSTOMER_PROFILE_REQUIRED", 403, "Customer profile is required.");
  if (identity.kind === "staff") throw new OrderEngineError("CUSTOMER_ACCESS_ONLY", 403, "Customer identity is required.");
  return identity;
}

function sendError(res: Response, error: unknown) {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  console.error("customer order history failed", error);
  res.status(500).json({ error: "CUSTOMER_ORDER_HISTORY_FAILED" });
}

export function createCustomerOrdersRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const identity = requireCustomer(await identityResolver(req));
      const parsedLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
      const result = await listCustomerOrdersV2(identity, {
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
