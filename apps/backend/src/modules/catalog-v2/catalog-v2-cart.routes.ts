import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import type { CustomerIdentity, RequestIdentity } from "../auth/auth.identity";
import { evaluateCatalogV2Pricing, type CatalogV2PriceRow } from "./catalog-v2.pricing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUANTITY = 1_000_000;

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

type VariantRow = CatalogV2PriceRow & {
  variant_id: string;
  product_id: string;
  sku: string;
  name: string;
  image_key: string | null;
  image_object_key: string | null;
};

function requireApprovedCustomer(identity: RequestIdentity): CustomerIdentity {
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
  console.error("catalog v2 cart failed", error);
  res.status(500).json({ error: "CATALOG_V2_CART_FAILED" });
}

export function createCatalogV2CartRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.post("/items", async (req, res) => {
    try {
      const identity = requireApprovedCustomer(await identityResolver(req));
      const variantId = typeof req.body?.variantId === "string" ? req.body.variantId.trim().toLowerCase() : "";
      const quantity = Number(req.body?.quantity);

      if (!UUID_PATTERN.test(variantId)) {
        res.status(400).json({ error: "INVALID_VARIANT_ID" });
        return;
      }
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
        res.status(400).json({ error: "INVALID_QUANTITY" });
        return;
      }

      const db = getDb();
      const variantResult = await db.query<VariantRow>(
        `SELECT
           variant.id::text AS variant_id,
           product.id::text AS product_id,
           variant.sku,
           variant.name,
           variant.price_mode,
           variant.price_label,
           variant.retail_price::text,
           variant.shop_price::text,
           price.price::text AS price_group_price,
           variant.image_key,
           variant.image_object_key,
           variant.status,
           variant.is_orderable,
           variant.is_active,
           variant.is_public
         FROM catalog_variants variant
         JOIN catalog_products product ON product.id = variant.product_id
         LEFT JOIN LATERAL (
           SELECT grouped.price
           FROM catalog_variant_prices grouped
           WHERE grouped.variant_id = variant.id
             AND grouped.price_group_id = $2::uuid
             AND grouped.min_quantity <= $3
           ORDER BY grouped.min_quantity DESC
           LIMIT 1
         ) price ON true
         WHERE variant.id = $1
           AND product.catalog_version = 'hung-phat-v2'
           AND variant.catalog_version = 'hung-phat-v2'
         LIMIT 1`,
        [variantId, identity.priceGroupId, quantity],
      );

      const variant = variantResult.rows[0];
      if (!variant) {
        res.status(404).json({ error: "VARIANT_NOT_FOUND" });
        return;
      }

      const pricing = evaluateCatalogV2Pricing(identity, variant);
      if (!pricing.canOrder || pricing.amount === null) {
        res.status(422).json({
          error: pricing.reason || "VARIANT_NOT_ORDERABLE",
          variantId,
          priceMode: variant.price_mode,
        });
        return;
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const cartResult = await client.query<{ id: string }>(
          `INSERT INTO carts (customer_id, status)
           VALUES ($1, 'active')
           ON CONFLICT (customer_id, status) DO UPDATE SET updated_at = now()
           RETURNING id::text`,
          [identity.customerId],
        );
        const cartId = cartResult.rows[0].id;

        await client.query(
          `INSERT INTO cart_items (
             cart_id, product_id, variant_id, quantity, unit_price
           ) VALUES ($1, NULL, $2, $3, $4)
           ON CONFLICT (cart_id, variant_id) WHERE variant_id IS NOT NULL
           DO UPDATE SET
             quantity = EXCLUDED.quantity,
             unit_price = EXCLUDED.unit_price,
             updated_at = now()`,
          [cartId, variantId, quantity, pricing.amount],
        );
        await client.query("COMMIT");

        res.status(201).json({
          cartId,
          item: {
            variantId,
            productId: variant.product_id,
            sku: variant.sku,
            name: variant.name,
            quantity,
            unitPrice: pricing.amount,
            lineTotal: Math.round(pricing.amount * quantity * 100) / 100,
            priceSource: pricing.source,
            image: {
              key: variant.image_key,
              objectKey: variant.image_object_key,
            },
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

  return router;
}
