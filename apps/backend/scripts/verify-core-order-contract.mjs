import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");

for (const envPath of [
  path.join(repoRoot, ".env"),
  path.join(backendRoot, ".env"),
  path.join(backendRoot, ".env.local"),
]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or BEPSI_DATABASE_URL is not configured.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
  max: 1,
});

let savepointCounter = 0;

async function expectDatabaseFailure(client, label, callback) {
  savepointCounter += 1;
  const savepoint = `contract_check_${savepointCounter}`;
  await client.query(`SAVEPOINT ${savepoint}`);

  try {
    await callback();
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    console.log(`PASS: ${label}`);
    return;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`${label} unexpectedly succeeded`);
}

const client = await pool.connect();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

try {
  await client.query("BEGIN");

  const customerResult = await client.query(
    `INSERT INTO customers (clerk_user_id, name, approval_status)
     VALUES ($1, $2, 'pending')
     RETURNING id`,
    [`contract-check-${suffix}`, "[CONTRACT CHECK] Customer"],
  );
  const customerId = customerResult.rows[0].id;

  await expectDatabaseFailure(client, "customer approval rejects unknown status", () =>
    client.query("UPDATE customers SET approval_status = 'unknown' WHERE id = $1", [customerId]),
  );

  await expectDatabaseFailure(client, "approved customer requires actor and timestamp", () =>
    client.query("UPDATE customers SET approval_status = 'approved' WHERE id = $1", [customerId]),
  );

  await client.query(
    `UPDATE customers
     SET approval_status = 'approved',
         approval_decided_by_actor_type = 'system',
         approval_decided_by_actor_id = 'system:contract-check',
         approval_decided_at = now(),
         approval_note = 'Phase 1 verification'
     WHERE id = $1`,
    [customerId],
  );

  const orderResult = await client.query(
    `INSERT INTO orders (
       order_code,
       customer_id,
       status,
       currency,
       subtotal,
       discount_total,
       total_amount,
       customer_note,
       internal_note,
       shipping_name,
       shipping_phone,
       shipping_address
     ) VALUES ($1, $2, 'pending', 'VND', 20000, 0, 20000, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      `CONTRACT-${suffix}`,
      customerId,
      "Customer note",
      "Internal note",
      "Contract Customer",
      "0900000000",
      "Contract address",
    ],
  );
  const orderId = orderResult.rows[0].id;

  await expectDatabaseFailure(client, "order rejects unknown status", () =>
    client.query("UPDATE orders SET status = 'unknown' WHERE id = $1", [orderId]),
  );

  await expectDatabaseFailure(client, "order item rejects zero quantity", () =>
    client.query(
      `INSERT INTO order_items (
         order_id, sku, name, unit, quantity, unit_price, line_total, product_type
       ) VALUES ($1, 'CHECK-ZERO', 'Zero quantity', 'unit', 0, 1000, 0, 'physical')`,
      [orderId],
    ),
  );

  await expectDatabaseFailure(client, "bundle item requires bundle snapshot", () =>
    client.query(
      `INSERT INTO order_items (
         order_id, sku, name, unit, quantity, unit_price, line_total, product_type
       ) VALUES ($1, 'CHECK-BUNDLE-MISSING', 'Bundle missing snapshot', 'bundle', 1, 10000, 10000, 'bundle')`,
      [orderId],
    ),
  );

  await client.query(
    `INSERT INTO order_items (
       order_id,
       sku,
       name,
       unit,
       quantity,
       unit_price,
       line_total,
       product_type,
       bundle_snapshot,
       snapshot_version
     ) VALUES ($1, 'CHECK-BUNDLE', 'Bundle snapshot', 'bundle', 2, 10000, 20000, 'bundle', $2::jsonb, 1)`,
    [
      orderId,
      JSON.stringify({
        components: [
          { productId: null, sku: "CHECK-COMPONENT", name: "Component snapshot", unit: "unit", quantity: 1 },
        ],
      }),
    ],
  );

  const statusLogResult = await client.query(
    `INSERT INTO order_status_logs (
       order_id, from_status, to_status, actor_type, actor_id, note
     ) VALUES ($1, NULL, 'pending', 'system', 'system:contract-check', 'Order created')
     RETURNING id, actor_id, created_at`,
    [orderId],
  );
  const statusLog = statusLogResult.rows[0];

  if (!statusLog.actor_id || !statusLog.created_at) {
    throw new Error("Status log is missing actor or timestamp");
  }

  await expectDatabaseFailure(client, "order status history rejects updates", () =>
    client.query("UPDATE order_status_logs SET note = 'mutated' WHERE id = $1", [statusLog.id]),
  );

  await expectDatabaseFailure(client, "order status history rejects deletes", () =>
    client.query("DELETE FROM order_status_logs WHERE id = $1", [statusLog.id]),
  );

  const snapshotResult = await client.query(
    `SELECT sku, name, unit, quantity, unit_price, line_total, product_type, bundle_snapshot, snapshot_version
     FROM order_items
     WHERE order_id = $1`,
    [orderId],
  );

  if (snapshotResult.rowCount !== 1 || snapshotResult.rows[0].product_type !== "bundle") {
    throw new Error("Order item snapshot verification failed");
  }

  await client.query("ROLLBACK");
  console.log("Core order contract verification passed.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Core order contract verification failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
