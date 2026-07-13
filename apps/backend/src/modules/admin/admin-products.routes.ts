import type { Request, Response } from "express";
import { Router } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import { isOrderEngineError } from "../orders/order-errors";
import { requireAdmin } from "./admin-access";
import {
  getAdminProductDetail,
  listAdminProducts,
  updateAdminProduct,
} from "./admin-products.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendAdminProductError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error("admin product request failed", error);
  res.status(500).json({ error: "ADMIN_PRODUCT_REQUEST_FAILED" });
}

export function createAdminProductsRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      const limit = Number.parseInt(String(req.query.limit ?? "100"), 10);
      const result = await listAdminProducts(identity, {
        search: req.query.q,
        issue: req.query.issue,
        limit: Number.isFinite(limit) ? limit : 100,
      });
      res.json(result);
    } catch (error) {
      sendAdminProductError(res, error);
    }
  });

  router.get("/:productId", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      const result = await getAdminProductDetail(identity, req.params.productId);
      res.json(result);
    } catch (error) {
      sendAdminProductError(res, error);
    }
  });

  router.patch("/:productId", async (req, res) => {
    try {
      const identity = requireAdmin(await identityResolver(req));
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await updateAdminProduct(identity, {
        productId: req.params.productId,
        ...body,
      });
      res.json(result);
    } catch (error) {
      sendAdminProductError(res, error);
    }
  });

  return router;
}
