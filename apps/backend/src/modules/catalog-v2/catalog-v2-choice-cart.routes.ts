import type { Request, Response } from "express";
import { Router } from "express";
import type { RequestIdentity } from "../auth/auth.identity";
import {
  CatalogV2CartError,
  addCatalogChoiceCartItem,
  removeCatalogChoiceCartItem,
} from "./catalog-v2-cart-domain.service";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function sendError(res: Response, error: unknown) {
  if (error instanceof CatalogV2CartError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }
  console.error("catalog choice cart failed", error);
  res.status(500).json({ error: "CATALOG_V2_CART_FAILED" });
}

export function createCatalogV2ChoiceCartRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/items", async (req, res) => {
    try {
      const result = await addCatalogChoiceCartItem(await identityResolver(req), req.body);
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/items/remove", async (req, res) => {
    try {
      res.json(await removeCatalogChoiceCartItem(await identityResolver(req), req.body));
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
