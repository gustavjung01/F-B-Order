import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("customer account navigation opens the account page without a registration redirect", () => {
  const navigation = read("apps/frontend/components/navigation/app-navigation.ts");
  const nextConfig = read("apps/frontend/next.config.mjs");
  const accountPage = read("apps/frontend/app/account/page.tsx");
  const accountStatus = read("apps/frontend/components/account/BackendAccountStatus.tsx");

  assert.match(navigation, /href:\s*["']\/account["'][\s\S]*label:\s*["']Tài khoản["']/u);
  assert.doesNotMatch(
    nextConfig,
    /source:\s*["']\/account["'][\s\S]*destination:\s*["']\/register["']/u,
  );
  assert.match(accountPage, /title=["']Tài khoản["']/u);
  assert.match(accountStatus, /href=["']\/orders["'][\s\S]*Đơn hàng của tôi/u);
});

test("customer account shows recent orders and frequently purchased products from order history", () => {
  const accountPage = read("apps/frontend/app/account/page.tsx");
  const insights = read("apps/frontend/components/account/AccountOrderInsights.tsx");

  assert.match(accountPage, /<AccountOrderInsights\s*\/>/u);
  assert.match(insights, /fetch\(["']\/api\/orders\?limit=20["']/u);
  assert.match(insights, /Đơn gần đây/u);
  assert.match(insights, /Sản phẩm hay mua/u);
  assert.match(insights, /order\.status !== ["']cancelled["']/u);
  assert.match(insights, /order\.status !== ["']rejected["']/u);
  assert.match(insights, /href=["']\/orders["']/u);
});
