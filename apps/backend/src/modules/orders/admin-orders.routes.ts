import type { Request, Response } from "express";
import { Router } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { isOrderEngineError, OrderEngineError } from "./order-errors";
import { isOrderStatus } from "./order-status";
import { listAdminOrders, transitionOrderStatus } from "./orders.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendAdminOrderError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error("admin order request failed", error);
  res.status(500).json({ error: "ADMIN_ORDER_REQUEST_FAILED" });
}

function requireStaff(identity: RequestIdentity) {
  if (identity.kind === "anonymous") {
    throw new OrderEngineError("AUTH_REQUIRED", 401, "Authentication is required.");
  }
  if (identity.kind !== "staff") {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Staff identity is required.");
  }
  if (!identity.isActive) {
    throw new OrderEngineError("STAFF_INACTIVE", 403, "Staff account is inactive.");
  }
  return identity;
}

export function createAdminOrdersRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const identity = requireStaff(await identityResolver(req));
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
      const result = await listAdminOrders(identity, {
        status,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      res.json(result);
    } catch (error) {
      sendAdminOrderError(res, error);
    }
  });

  router.patch("/:orderId/status", async (req, res) => {
    try {
      const identity = requireStaff(await identityResolver(req));
      const status = req.body?.status;
      if (!isOrderStatus(status)) {
        throw new OrderEngineError("INVALID_ORDER_STATUS", 400, "Unknown order status.");
      }
      const note = typeof req.body?.note === "string" ? req.body.note : null;
      const result = await transitionOrderStatus(identity, {
        orderId: req.params.orderId,
        status,
        note,
      });
      res.json(result);
    } catch (error) {
      sendAdminOrderError(res, error);
    }
  });

  return router;
}
