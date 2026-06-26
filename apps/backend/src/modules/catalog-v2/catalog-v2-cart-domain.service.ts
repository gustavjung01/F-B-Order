import type { Pool, PoolClient } from "pg";
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
const MAX_BATCH_ITEMS = 200;

export class CatalogV2CartError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type AddCatalogChoiceCartItemInput = {
  variantId: string;
  quantity: number;
  selections: Record<string, string>;
};

export type CatalogChoiceCartItemResult = {
  variant_id: string;
  variantId: string;
  product_id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  selections: Record<string, string>;
  selectionKey: string;
  price: number;
  unitPrice: number;
  lineTotal: number;
  priceSource: "dealer" | "market" | null;
  image: {
    key: string | null;
    objectKey: string | null;
  };
};

function fail(code: string, status: number, message: string, details?: unknown): never {
  throw new CatalogV2CartError(code, status, message, details);
}

export function requireApprovedCatalogCustomer(identity: RequestIdentity): CustomerIdentity {
  if (identity.kind === "anonymous") fail("AUTH_REQUIRED", 401, "Authentication required.");
  if (identity.kind === "unmapped") fail("CUSTOMER_PROFILE_REQUIRED", 403, "Customer profile required.");
  if (identity.kind === "staff") fail("CUSTOMER_ACCESS_ONLY", 403, "Customer account required.");
  if (identity.accountStatus !== "active") fail("CUSTOMER_INACTIVE", 403, "Customer account is not active.");
  if (identity.approvalStatus !== "approved") fail("CUSTOMER_NOT_APPROVED", 403, "Shop approval is required.");
  return identity;
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("INVALID_CART_ITEM", 400, "Cart item body must be an object.");
  }
  return value as Record<string, unknown>;
}

function normalizeVariantId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(normalized)) fail("INVALID_VARIANT_ID", 400, "variantId must be a UUID.");
  return normalized;
}

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    fail("INVALID_QUANTITY", 400, `quantity must be an integer from 1 to ${MAX_QUANTITY}.`);
  }
  return quantity;
}

export function normalizeAddCatalogChoiceCartItemInput(raw: unknown): AddCatalogChoiceCartItemInput {
  const source = bodyObject(raw);
  return {
    variantId: normalizeVariantId(source.variantId ?? source.variant_id),
    quantity: normalizeQuantity(source.quantity),
    selections: source.selections && typeof source.selections === "object" && !Array.isArray(source.selections)
      ? source.selections as Record<string, string>
      : {},
  };
}

function normalizeRemoveInput(raw: unknown) {
  const source = bodyObject(raw);
  const selectionKey = typeof source.selectionKey === "string"
    ? source.selectionKey.trim()
    : typeof source.selection_key === "string"
      ? source.selection_key.trim()
      : "";
  if (selectionKey.length > 500) fail("INVALID_CART_ITEM_IDENTITY", 400, "selectionKey is too long.");
  return {
    variantId: normalizeVariantId(source.variantId ?? source.variant_id),
    selectionKey,
  };
}

async function transaction<T>(db: Pool, run: (client: PoolClient) => Promise<T>) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function resolveCartItem(
  identity: CustomerIdentity,
  input: AddCatalogChoiceCartItemInput,
  client: PoolClient,
): Promise<{
  input: AddCatalogChoiceCartItemInput;
  unitPrice: number;
  result: CatalogChoiceCartItemResult;
}> {
  const variant = await findCatalogChoiceVariant(input.variantId, identity.priceGroupId, input.quantity, client);
  if (!variant) fail("VARIANT_NOT_FOUND", 404, "Catalog variant was not found.", { variantId: input.variantId });

  const groups = catalogChoiceGroupsForSku(parseCatalogChoiceGroups(variant.choice_groups), variant.sku);
  let selection: { selections: Record<string, string>; selectionKey: string };
  try {
    selection = validateCatalogSelections(input.selections, groups);
  } catch (error) {
    const source = error as { code?: string; status?: number; message?: string };
    fail(source.code || "INVALID_SELECTION", source.status || 400, source.message || "Invalid catalog selection.");
  }

  const pricing = evaluateCatalogV2Pricing(identity, variant);
  if (!pricing.canOrder || pricing.amount === null) {
    fail(pricing.reason || "VARIANT_NOT_ORDERABLE", 422, "Catalog variant cannot be ordered.", {
      variantId: input.variantId,
    });
  }

  return {
    input: {
      ...input,
      selections: selection.selections,
    },
    unitPrice: pricing.amount,
    result: {
      variant_id: input.variantId,
      variantId: input.variantId,
      product_id: variant.product_id,
      productId: variant.product_id,
      sku: variant.sku,
      name: variant.name,
      quantity: input.quantity,
      selections: selection.selections,
      selectionKey: selection.selectionKey,
      price: pricing.amount,
      unitPrice: pricing.amount,
      lineTotal: Math.round(pricing.amount * input.quantity * 100) / 100,
      priceSource: pricing.source,
      image: {
        key: variant.image_key,
        objectKey: variant.image_object_key,
      },
    },
  };
}

export async function addCatalogChoiceCartItems(
  identityValue: RequestIdentity,
  rawItems: unknown,
  db: Pool = getDb(),
) {
  const identity = requireApprovedCatalogCustomer(identityValue);
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_BATCH_ITEMS) {
    fail("INVALID_CART_ITEMS", 400, `items must contain from 1 to ${MAX_BATCH_ITEMS} entries.`);
  }
  const items = rawItems.map(normalizeAddCatalogChoiceCartItemInput);

  return transaction(db, async (client) => {
    const cartId = await ensureActiveCatalogCart(client, identity.customerId);
    const resolved = [] as Awaited<ReturnType<typeof resolveCartItem>>[];

    for (const input of items) {
      const item = await resolveCartItem(identity, input, client);
      await upsertCatalogChoiceCartLine(client, {
        cartId,
        variantId: item.result.variantId,
        quantity: item.result.quantity,
        unitPrice: item.unitPrice,
        selections: item.result.selections,
        selectionKey: item.result.selectionKey,
      });
      resolved.push(item);
    }

    return {
      cartId,
      items: resolved.map((item) => item.result),
      itemCount: resolved.length,
      currency: "VND" as const,
    };
  });
}

export async function addCatalogChoiceCartItem(
  identity: RequestIdentity,
  rawItem: unknown,
  db: Pool = getDb(),
) {
  const result = await addCatalogChoiceCartItems(identity, [rawItem], db);
  return {
    cartId: result.cartId,
    item: result.items[0],
  };
}

export async function removeCatalogChoiceCartItem(
  identityValue: RequestIdentity,
  rawItem: unknown,
  db: Pool = getDb(),
) {
  const identity = requireApprovedCatalogCustomer(identityValue);
  const input = normalizeRemoveInput(rawItem);
  const client = await db.connect();
  try {
    const result = await removeCatalogChoiceCartLine(client, {
      customerId: identity.customerId,
      variantId: input.variantId,
      selectionKey: input.selectionKey,
    });
    return {
      variant_id: input.variantId,
      variantId: input.variantId,
      selectionKey: input.selectionKey,
      removed: (result.rowCount ?? 0) > 0,
    };
  } finally {
    client.release();
  }
}
