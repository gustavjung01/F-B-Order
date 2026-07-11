import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool";

const ONESIGNAL_API_URL = "https://api.onesignal.com/notifications";

type DbClient = Pool | PoolClient;

export type PushNotificationInput = {
  title: string;
  message: string;
  url?: string;
  data?: Record<string, string | number | boolean | null>;
};

export type PushNotificationResult =
  | { ok: true; skipped?: false; id?: string | null; recipients: number }
  | { ok: true; skipped: true; reason: string; recipients: number }
  | { ok: false; error: string; recipients: number };

type OneSignalCreateNotificationResponse = {
  id?: string;
  errors?: unknown;
};

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function getOneSignalConfig() {
  const appId = (process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
  const restApiKey = (process.env.ONESIGNAL_REST_API_KEY || "").trim();
  const frontendUrl = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "https://bepsi.click")
    .trim()
    .replace(/\/+$/, "");

  return { appId, restApiKey, frontendUrl };
}

export function isOneSignalConfigured(): boolean {
  const { appId, restApiKey } = getOneSignalConfig();
  return Boolean(appId && restApiKey);
}

export async function loadCustomerPushExternalIds(
  customerId: string,
  db: DbClient = getDb(),
): Promise<string[]> {
  const result = await db.query<{ clerk_user_id: string | null }>(
    `SELECT customer_user.clerk_user_id
     FROM customer_users customer_user
     WHERE customer_user.customer_id = $1
     UNION
     SELECT customer.clerk_user_id
     FROM customers customer
     WHERE customer.id = $1
       AND customer.clerk_user_id IS NOT NULL`,
    [customerId],
  );

  return uniqueNonEmpty(result.rows.map((row) => row.clerk_user_id));
}

export async function loadStaffPushExternalIds(db: DbClient = getDb()): Promise<string[]> {
  const result = await db.query<{ clerk_user_id: string | null }>(
    `SELECT staff.clerk_user_id
     FROM staff_users staff
     WHERE staff.is_active = true
       AND staff.role IN ('admin', 'staff')`,
  );

  return uniqueNonEmpty(result.rows.map((row) => row.clerk_user_id));
}

export async function sendPushToExternalIds(
  externalIds: string[],
  input: PushNotificationInput,
): Promise<PushNotificationResult> {
  const recipients = uniqueNonEmpty(externalIds);
  if (recipients.length === 0) {
    return { ok: true, skipped: true, reason: "NO_RECIPIENTS", recipients: 0 };
  }

  const { appId, restApiKey, frontendUrl } = getOneSignalConfig();
  if (!appId || !restApiKey) {
    return { ok: true, skipped: true, reason: "ONESIGNAL_NOT_CONFIGURED", recipients: recipients.length };
  }

  const url = input.url?.startsWith("http") ? input.url : `${frontendUrl}${input.url || "/"}`;
  const response = await fetch(ONESIGNAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${restApiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: "push",
      include_aliases: {
        external_id: recipients,
      },
      headings: { en: input.title, vi: input.title },
      contents: { en: input.message, vi: input.message },
      url,
      data: input.data || {},
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as OneSignalCreateNotificationResponse;
  if (!response.ok || payload.errors) {
    return {
      ok: false,
      error: JSON.stringify({ status: response.status, errors: payload.errors || payload }),
      recipients: recipients.length,
    };
  }

  return { ok: true, id: payload.id || null, recipients: recipients.length };
}

export function logPushResult(scope: string, result: PushNotificationResult): void {
  if (result.ok && result.skipped) {
    console.info(`[OneSignal] ${scope} skipped`, { reason: result.reason, recipients: result.recipients });
    return;
  }

  if (result.ok) {
    console.info(`[OneSignal] ${scope} sent`, { id: result.id ?? null, recipients: result.recipients });
    return;
  }

  console.warn(`[OneSignal] ${scope} failed`, { error: result.error, recipients: result.recipients });
}

export async function notifyCustomerApprovalChanged(input: { customerId: string; status: "approved" | "rejected"; note?: string | null }): Promise<PushNotificationResult> {
  const ids = await loadCustomerPushExternalIds(input.customerId);
  return sendPushToExternalIds(ids, { title: "Cập nhật hồ sơ quán", message: input.note || `Hồ sơ quán ${input.status}.` });
}

export async function notifyOrderStatusChanged(input: { customerId: string; orderId: string; orderCode?: string | null; status: string }): Promise<PushNotificationResult> {
  const ids = await loadCustomerPushExternalIds(input.customerId);
  return sendPushToExternalIds(ids, { title: "Cập nhật đơn hàng", message: `Đơn ${input.orderCode || input.orderId}: ${input.status}` });
}

export async function notifyStaffNewOrder(input: { orderId: string; orderCode?: string | null }): Promise<PushNotificationResult> {
  const ids = await loadStaffPushExternalIds();
  return sendPushToExternalIds(ids, { title: "Có đơn hàng mới", message: `Đơn ${input.orderCode || input.orderId} mới được tạo` });
}

export function runPushTask(scope: string, task: () => Promise<PushNotificationResult>): void {
  void task()
    .then((result) => logPushResult(scope, result))
    .catch((error) => {
      const message = error instanceof Error ? error.message : "UNKNOWN_NOTIFICATION_ERROR";
      console.warn(`[OneSignal] ${scope} failed`, { error: message, recipients: 0 });
    });
}
