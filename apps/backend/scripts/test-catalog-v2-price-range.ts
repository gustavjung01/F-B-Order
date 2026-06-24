import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { getDb } from "../src/db/pool";

async function main() {
  const app = createApp({
    port: 0,
    serviceName: "catalog-v2-price-range-test",
    corsOrigin: "http://localhost:3000",
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/catalog/products?limit=500`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      products: Array<{
        productKey: string;
        variantCount: number;
        priceMin: number | null;
        priceMax: number | null;
      }>;
    };

    assert.ok(body.products.every((product) => Number.isInteger(product.variantCount) && product.variantCount >= 1));
    assert.ok(body.products.every((product) => (
      product.priceMin === null || product.priceMax === null || product.priceMin <= product.priceMax
    )));

    const mamaGold = body.products.find((product) => product.productKey === "siro-mama-gold");
    assert.ok(mamaGold);
    assert.equal(mamaGold.variantCount, 2);
    assert.equal(mamaGold.priceMin, 53000);
    assert.equal(mamaGold.priceMax, 140000);

    console.log("Catalog parent price range passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await getDb().end();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
