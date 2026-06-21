import type { Request, Response } from "express";
import { Router } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { isOrderEngineError, OrderEngineError } from "../orders/order-errors";
import { validateCart } from "./cart-validation.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

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

function sendCartError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }
  console.error("cart validation failed", error);
  res.status(500).json({ error: "CART_VALIDATION_FAILED" });
}

export function createCartRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/validate", async (req, res) => {
    try {
      const identity = requireCustomer(await identityResolver(req));
      const result = await validateCart(identity, req.body?.items);
      res.json(result);
    } catch (error) {
      sendCartError(res, error);
    }
  });

  return router;
}
