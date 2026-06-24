import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "apps/frontend/components/mobile/ProductHome.tsx",
  "apps/frontend/components/desktop/DesktopHome.tsx",
  "apps/frontend/components/mobile/ProductQuickView.tsx",
  "apps/frontend/app/cart/page.tsx",
  "apps/frontend/app/register/page.tsx",
  "apps/frontend/components/account/RegisterShopForm.tsx",
  "apps/frontend/components/auth/AccountGate.tsx",
  "apps/frontend/components/auth/AccountAction.tsx",
  "apps/frontend/app/promotions/page.tsx",
  "apps/frontend/app/recipes/page.tsx",
];

const forbidden = [
  "Một card = một sản phẩm cha",
  "Một sản phẩm cha · nhiều biến thể",
  "2 card / hàng",
  "Giỏ hàng variant_id",
  "Giỏ hàng lưu đúng variant_id",
  "Catalog v2",
  "Checkout variant",
  "order v2",
  "Xem 188 sản phẩm",
  "popup Clerk",
  "cho admin duyet",
  "Tính năng đang được phát triển",
];

const hits = [];
for (const relativePath of files) {
  const content = fs.readFileSync(path.join(root, relativePath), "utf8");
  for (const phrase of forbidden) {
    if (content.includes(phrase)) hits.push(`${relativePath}: ${phrase}`);
  }
}

if (hits.length > 0) {
  console.error("Production copy audit failed:");
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log(`Production copy audit passed for ${files.length} customer-facing files.`);
