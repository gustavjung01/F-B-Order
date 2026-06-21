import type { Request, Response } from "express";
import { Router } from "express";
import { requireAdmin } from "../admin/admin-access";
import {
  getAdminOrderDetail,
  updateOrderInternalNote,
} from "../admin/admin-orders.service";
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

export function createAdminOrdersRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
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

  router.get("/:orderId", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      const result = await getAdminOrderDetail(identity, req.params.orderId);
      res.json(result);
    } catch (error) {
      sendAdminOrderError(res, error);
    }
  });

  router.patch("/:orderId/status", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      const status = req.body?.status;
      if (!isOrderStatus(status)) {
        throw new OrderEngineError("INVALID_ORDER_STATUS", 400, "Unknown order status.");
      }
      const note = typeof req.body?.note === "string" ? req.body.note : null;
      await transitionOrderStatus(identity, {
        orderId: req.params.orderId,
        status,
        note,
      });
      const result = await getAdminOrderDetail(identity, req.params.orderId);
      res.json(result);
    } catch (error) {
      sendAdminOrderError(res, error);
    }
  });

  router.patch("/:orderId/internal-note", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      const result = await updateOrderInternalNote(identity, {
        orderId: req.params.orderId,
        note: req.body?.note,
      });
      res.json(result);
    } catch (error) {
      sendAdminOrderError(res, error);
    }
  });

  return router;
}
