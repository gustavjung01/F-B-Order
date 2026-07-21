import type { Request, Response } from "express";
import { Router } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { requirePermission } from "../auth/auth.permissions";
import { isOrderEngineError } from "../orders/order-errors";
import { requireAdmin } from "./admin-access";
import {
  decideCustomerApproval,
  getAdminCustomerDetail,
  listAdminCustomers,
} from "./admin-customers.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendAdminCustomerError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error("admin customer request failed", error);
  res.status(500).json({ error: "ADMIN_CUSTOMER_REQUEST_FAILED" });
}

export function createAdminCustomersRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "customers.view");
      const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
      const result = await listAdminCustomers(identity, {
        approvalStatus: req.query.approvalStatus,
        search: req.query.q,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      res.json(result);
    } catch (error) {
      sendAdminCustomerError(res, error);
    }
  });

  router.get("/:customerId", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "customers.view");
      const result = await getAdminCustomerDetail(identity, req.params.customerId);
      res.json(result);
    } catch (error) {
      sendAdminCustomerError(res, error);
    }
  });

  router.patch("/:customerId/approval", async (req, res) => {
    try {
      const identity = await requirePermission(requireAdmin(await identityResolver(req)), "customers.update");
      const result = await decideCustomerApproval(identity, {
        customerId: req.params.customerId,
        status: req.body?.status,
        note: req.body?.note,
      });
      res.json(result);
    } catch (error) {
      sendAdminCustomerError(res, error);
    }
  });

  return router;
}
