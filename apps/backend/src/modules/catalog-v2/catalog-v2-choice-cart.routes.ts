import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import type { CustomerIdentity, RequestIdentity } from "../auth/auth.identity";
import {
  catalogChoiceGroupsForSku,
  parseCatalogChoiceGroups,
  validateCatalogSelections,
} from "./catalog-v2-choices";
import {
  ensureActiveCatalogCart,
  findCatalogChoiceVariant,
  removeCatalogChoiceCartLine,
  upsertCatalogChoiceCartLine,
} from "./catalog-v2-choice-cart.service";
import { evaluateCatalogV2Pricing } from "./catalog-v2.pricing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUANTITY = 1_000_000;

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
  console.error("catalog choice cart failed", error);
  res.status(500).json({ error: "CATALOG_V2_CART_FAILED" });
}

function readVariantId(body: unknown) {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const raw = source.variant_id ?? source.variantId;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function createCatalogV2ChoiceCartRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/items", async (req, res) => {
    try {
      const identity = requireCustomer(await identityResolver(req));
      const variantId = readVariantId(req.body);
      const quantity = Number(req.body?.quantity);
      if (!UUID_PATTERN.test(variantId)) return void res.status(400).json({ error: "INVALID_VARIANT_ID" });
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) return void res.status(400).json({ error: "INVALID_QUANTITY" });

      const variant = await findCatalogChoiceVariant(variantId, identity.priceGroupId, quantity);
      if (!variant) return void res.status(404).json({ error: "VARIANT_NOT_FOUND" });
      const groups = catalogChoiceGroupsForSku(parseCatalogChoiceGroups(variant.choice_groups), variant.sku);
      const selection = validateCatalogSelections(req.body?.selections, groups);
      const pricing = evaluateCatalogV2Pricing(identity, variant);
      if (!pricing.canOrder || pricing.amount === null) {
        return void res.status(422).json({ error: pricing.reason || "VARIANT_NOT_ORDERABLE", variant_id: variantId });
      }

      const client = await getDb().connect();
      try {
        await client.query("BEGIN");
        const cartId = await ensureActiveCatalogCart(client, identity.customerId);
        await upsertCatalogChoiceCartLine(client, {
          cartId,
          variantId,
          quantity,
          unitPrice: pricing.amount,
          selections: selection.selections,
          selectionKey: selection.selectionKey,
        });
        await client.query("COMMIT");
        res.status(201).json({
          cartId,
          item: {
            variant_id: variantId,
            variantId,
            product_id: variant.product_id,
            productId: variant.product_id,
            sku: variant.sku,
            name: variant.name,
            quantity,
            selections: selection.selections,
            selectionKey: selection.selectionKey,
            price: pricing.amount,
            unitPrice: pricing.amount,
            lineTotal: Math.round(pricing.amount * quantity * 100) / 100,
            priceSource: pricing.source,
            image: { key: variant.image_key, objectKey: variant.image_object_key },
          },
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/items/remove", async (req, res) => {
    try {
      const identity = requireCustomer(await identityResolver(req));
      const variantId = readVariantId(req.body);
      const selectionKey = typeof req.body?.selectionKey === "string" ? req.body.selectionKey.trim() : "";
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
