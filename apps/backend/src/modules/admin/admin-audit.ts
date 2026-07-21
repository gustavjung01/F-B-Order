import type { PoolClient } from "pg";
import { getDb } from "../../db/pool.js";

export type AdminAuditInput = {
  actorStaffId: string | null;
  actionKey: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "success" | "denied" | "failed";
  permissionKey?: string | null;
  reason?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAdminAuditLog(
  input: AdminAuditInput,
  client?: PoolClient,
): Promise<void> {
  const db = client ?? getDb();
  await db.query(
    `INSERT INTO admin_audit_logs(
       actor_staff_id, action_key, resource_type, resource_id, outcome,
       permission_key, reason, before_data, after_data, metadata,
       request_id, ip_address, user_agent
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13)`,
    [
      input.actorStaffId,
      input.actionKey,
      input.resourceType,
      input.resourceId ?? null,
      input.outcome,
      input.permissionKey ?? null,
      input.reason ?? null,
      input.beforeData === undefined ? null : JSON.stringify(input.beforeData),
      input.afterData === undefined ? null : JSON.stringify(input.afterData),
      JSON.stringify(input.metadata ?? {}),
      input.requestId ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );
}
