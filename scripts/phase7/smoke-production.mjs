import assert from "node:assert/strict";

const apiBaseUrl = (process.env.API_BASE_URL || "https://api.bepsi.click").replace(/\/+$/, "");
const webBaseUrl = (process.env.WEB_BASE_URL || "https://bepsi.click").replace(/\/+$/, "");
const expectedBackendVersion = process.env.BEPSI_EXPECTED_BACKEND_VERSION || "catalog-v2-backend";
const requireAuthSmoke = process.env.PHASE7_REQUIRE_AUTH_SMOKE === "true";
const approvedToken = process.env.PHASE7_APPROVED_CUSTOMER_TOKEN || "";
const adminToken = process.env.PHASE7_ADMIN_TOKEN || "";
const productId = process.env.PHASE7_SMOKE_PRODUCT_ID || "";
const quantity = Number.parseInt(process.env.PHASE7_SMOKE_QUANTITY || "1", 10);
const runId = process.env.GITHUB_RUN_ID || Date.now().toString();

function authorization(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    ...options,
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body, text };
}

function requireStatus(result, expected, label) {
  assert.equal(
    result.response.status,
    expected,
    `${label}: expected HTTP ${expected}, got ${result.response.status}; body=${result.text}`,
  );
}

async function publicSmoke() {
  const health = await requestJson(`${apiBaseUrl}/api/health`);
  requireStatus(health, 200, "backend health");
  assert.equal(health.body?.ok, true, "backend health payload must be ok");

  const version = await requestJson(`${apiBaseUrl}/api/version`);
  requireStatus(version, 200, "backend version");
  assert.equal(version.body?.version, expectedBackendVersion, "unexpected backend version");

  const categories = await requestJson(`${apiBaseUrl}/api/catalog/categories`);
  requireStatus(categories, 200, "backend categories");
  assert.ok(Array.isArray(categories.body?.categories), "categories payload is invalid");

  const anonymousCatalog = await requestJson(`${apiBaseUrl}/api/catalog/products?limit=5`);
  requireStatus(anonymousCatalog, 200, "anonymous backend catalog");
  assert.ok(Array.isArray(anonymousCatalog.body?.products), "products payload is invalid");
  for (const product of anonymousCatalog.body.products) {
    assert.equal(product.pricing?.visibility, "hidden", "anonymous catalog leaked visible pricing");
    assert.equal(Object.hasOwn(product.pricing || {}, "amount"), false, "anonymous catalog leaked price amount");
  }

  const frontendCatalog = await requestJson(`${webBaseUrl}/api/catalog/products?limit=1`);
  requireStatus(frontendCatalog, 200, "frontend catalog proxy");
  assert.ok(Array.isArray(frontendCatalog.body?.products), "frontend catalog proxy payload is invalid");

  const frontendIdentity = await requestJson(`${webBaseUrl}/api/auth/me`);
  requireStatus(frontendIdentity, 401, "frontend backend-mode identity gate");
  assert.equal(frontendIdentity.body?.error, "AUTH_REQUIRED", "frontend is not behaving as backend mode");
}

async function authenticatedOrderSmoke() {
  const authInputs = [approvedToken, adminToken, productId];
  const hasAnyAuthInput = authInputs.some(Boolean);
  const hasAllAuthInputs = authInputs.every(Boolean);

  if (!hasAllAuthInputs) {
    if (requireAuthSmoke || hasAnyAuthInput) {
      throw new Error(
        "Authenticated smoke requires PHASE7_APPROVED_CUSTOMER_TOKEN, PHASE7_ADMIN_TOKEN and PHASE7_SMOKE_PRODUCT_ID.",
      );
    }
    console.log("Authenticated order smoke skipped because no production smoke credentials were supplied.");
    return null;
  }

  assert.ok(Number.isInteger(quantity) && quantity > 0, "PHASE7_SMOKE_QUANTITY must be a positive integer");

  const identity = await requestJson(`${apiBaseUrl}/api/auth/me`, {
    headers: authorization(approvedToken),
  });
  requireStatus(identity, 200, "approved customer identity");
  assert.equal(identity.body?.approvalStatus, "approved", "smoke customer is not approved");
  assert.equal(identity.body?.canPlaceOrder, true, "smoke customer cannot place orders");

  const catalog = await requestJson(`${apiBaseUrl}/api/catalog/products?limit=100`, {
    headers: authorization(approvedToken),
  });
  requireStatus(catalog, 200, "approved customer catalog");
  const product = catalog.body?.products?.find((item) => item.id === productId);
  assert.ok(product, `smoke product ${productId} was not returned by catalog`);
  assert.equal(product.pricing?.visibility, "visible", "smoke product price is not visible");
  assert.equal(product.isOrderable, true, "smoke product is not orderable");

  const safeQuantity = Math.max(quantity, Number(product.minOrderQty || 1));
  const items = [{ productId, quantity: safeQuantity }];
  const cart = await requestJson(`${apiBaseUrl}/api/cart/validate`, {
    method: "POST",
    headers: {
      ...authorization(approvedToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ items }),
  });
  requireStatus(cart, 200, "production cart validation");
  assert.equal(cart.body?.canCheckout, true, "production cart cannot checkout");
  assert.ok(Number(cart.body?.totalPreview) > 0, "production cart total preview is invalid");

  const idempotencyKey = `phase7-production-${runId}-${productId}`.slice(0, 120);
  const order = await requestJson(`${apiBaseUrl}/api/orders`, {
    method: "POST",
    headers: {
      ...authorization(approvedToken),
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ items }),
  });
  assert.ok([200, 201].includes(order.response.status), `order create failed: ${order.text}`);
  assert.ok(order.body?.order?.id, "backend did not return an order ID after commit");

  const adminOrders = await requestJson(`${apiBaseUrl}/api/admin/orders?limit=100`, {
    headers: authorization(adminToken),
  });
  requireStatus(adminOrders, 200, "admin order list");
  assert.equal(
    adminOrders.body?.orders?.some((item) => item.id === order.body.order.id),
    true,
    `order ${order.body.order.id} was not immediately visible in admin`,
  );

  return order.body.order;
}

await publicSmoke();
const order = await authenticatedOrderSmoke();
console.log("Phase 7 production smoke passed.");
if (order) {
  console.log(`Production smoke order: ${order.orderCode} (${order.id})`);
}
