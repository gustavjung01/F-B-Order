import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { getDb } from "../../db/pool.js";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity.js";
import { requirePermission } from "../auth/auth.permissions.js";
import { isOrderEngineError, OrderEngineError } from "../orders/order-errors.js";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

function requireStaffIdentity(identity: RequestIdentity): StaffIdentity {
  if (identity.kind !== "staff" || !identity.isActive) {
    throw new OrderEngineError("STAFF_ACCESS_REQUIRED", 403, "Active staff access is required");
  }
  return identity;
}

const createStaffSchema = z.object({
  clerkUserId: z.string().min(3).max(200),
  email: z.string().email(),
  name: z.string().trim().min(1).max(200),
  roleKeys: z.array(z.string().trim().min(1).max(100)).default([]),
  note: z.string().trim().max(500).optional(),
});

const updateStaffSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

const roleMutationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

function requestMeta(req: Request) {
  return {
    requestId: String(req.headers["x-request-id"] ?? "").trim() || null,
    ipAddress: req.ip || null,
  };
}

function sendError(res: Response, error: unknown): void {
  if (isOrderEngineError(error)) {
    res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "INVALID_REQUEST", details: error.flatten() });
    return;
  }
  const code = (error as { code?: string }).code;
  if (code === "23505") {
    res.status(409).json({ error: "STAFF_CONFLICT" });
    return;
  }
  console.error("admin staff request failed", error);
  res.status(500).json({ error: "ADMIN_STAFF_REQUEST_FAILED" });
}

async function assertRoleAssignable(roleKey: string) {
  const result = await getDb().query<{ id: string; role_key: string; is_active: boolean }>(
    `SELECT id::text, role_key, is_active
     FROM rbac_roles
     WHERE role_key = $1`,
    [roleKey],
  );
  const role = result.rows[0];
  if (!role || !role.is_active) {
    throw new OrderEngineError("ROLE_NOT_FOUND", 404, "Role not found or inactive", { roleKey });
  }
  return role;
}

export function createAdminStaffRouter(identityResolver: IdentityResolver) {
  const router = Router();

  router.get("/roles", async (req, res) => {
    try {
      const identity = requireStaffIdentity(await identityResolver(req));
      await requirePermission(identity, "staff.view");
      const result = await getDb().query(
        `SELECT
           role.id::text,
           role.role_key,
           role.name,
           role.description,
           role.is_system,
           role.is_active,
           COALESCE(jsonb_agg(jsonb_build_object(
             'permissionKey', permission.permission_key,
             'moduleKey', permission.module_key,
             'actionKey', permission.action_key,
             'riskLevel', permission.risk_level
           ) ORDER BY permission.permission_key) FILTER (WHERE permission.id IS NOT NULL), '[]'::jsonb) AS permissions
         FROM rbac_roles role
         LEFT JOIN rbac_role_permissions role_permission ON role_permission.role_id = role.id
         LEFT JOIN rbac_permissions permission ON permission.id = role_permission.permission_id
         GROUP BY role.id
         ORDER BY role.role_key`,
      );
      res.json({ roles: result.rows });
    } catch (error) { sendError(res, error); }
  });

  router.get("/permissions", async (req, res) => {
    try {
      const identity = requireStaffIdentity(await identityResolver(req));
      await requirePermission(identity, "staff.view");
      const result = await getDb().query(
        `SELECT id::text, permission_key, module_key, action_key, description, risk_level, is_system
         FROM rbac_permissions
         ORDER BY module_key, action_key`,
      );
      res.json({ permissions: result.rows });
    } catch (error) { sendError(res, error); }
  });

  router.get("/", async (req, res) => {
    try {
      const identity = requireStaffIdentity(await identityResolver(req));
      await requirePermission(identity, "staff.view");
      const result = await getDb().query(
        `SELECT
           staff.id::text,
           staff.clerk_user_id,
           staff.email,
           staff.name,
           staff.role AS legacy_role,
           staff.is_active,
           staff.created_at,
           staff.updated_at,
           COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
             'roleKey', role.role_key,
             'name', role.name,
             'assignedAt', assignment.assigned_at
           )) FILTER (WHERE role.id IS NOT NULL AND assignment.revoked_at IS NULL), '[]'::jsonb) AS roles
         FROM staff_users staff
         LEFT JOIN staff_role_assignments assignment ON assignment.staff_user_id = staff.id AND assignment.revoked_at IS NULL
         LEFT JOIN rbac_roles role ON role.id = assignment.role_id
         GROUP BY staff.id
         ORDER BY staff.created_at DESC`,
      );
      res.json({ staff: result.rows });
    } catch (error) { sendError(res, error); }
  });

  router.get("/:staffId", async (req, res) => {
    try {
      const identity = requireStaffIdentity(await identityResolver(req));
      await requirePermission(identity, "staff.view");
      const [staffResult, permissionResult, logResult] = await Promise.all([
        getDb().query(
          `SELECT id::text, clerk_user_id, email, name, role AS legacy_role, is_active, created_at, updated_at
           FROM staff_users WHERE id = $1`,
          [req.params.staffId],
        ),
        getDb().query(
          `SELECT role_key, permission_key, module_key, action_key, risk_level
           FROM staff_effective_permissions
           WHERE staff_user_id = $1
           ORDER BY role_key, permission_key`,
          [req.params.staffId],
        ),
        getDb().query(
          `SELECT log.id::text, role.role_key, log.action, log.reason, log.request_id,
                  log.ip_address::text, log.metadata, log.created_at,
                  actor.id::text AS actor_staff_id, actor.email AS actor_email
           FROM staff_role_assignment_logs log
           JOIN rbac_roles role ON role.id = log.role_id
           LEFT JOIN staff_users actor ON actor.id = log.actor_staff_id
           WHERE log.staff_user_id = $1
           ORDER BY log.created_at DESC
           LIMIT 100`,
          [req.params.staffId],
        ),
      ]);
      if (!staffResult.rows[0]) throw new OrderEngineError("STAFF_NOT_FOUND", 404, "Staff user not found");
      res.json({ staff: staffResult.rows[0], effectivePermissions: permissionResult.rows, roleLogs: logResult.rows });
    } catch (error) { sendError(res, error); }
  });

  router.post("/", async (req, res) => {
    try {
      const identity = requireStaffIdentity(await identityResolver(req));
      await requirePermission(identity, "staff.manage");
      const input = createStaffSchema.parse(req.body ?? {});
      if (input.roleKeys.length > 0) {
        await requirePermission(identity, "staff.roles.assign");
      }
      const db = getDb();
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const staffResult = await client.query<{ id: string }>(
          `INSERT INTO staff_users(clerk_user_id, email, name, role, is_active)
           VALUES($1, lower($2), $3, 'staff', true)
           RETURNING id::text`,
          [input.clerkUserId, input.email, input.name],
        );
        const staffId = staffResult.rows[0].id;
        for (const roleKey of input.roleKeys) {
          const role = await assertRoleAssignable(roleKey);
          await client.query(
            `INSERT INTO staff_role_assignments(
               staff_user_id, role_id, assigned_by_staff_id, assignment_source, note
             ) VALUES($1,$2,$3,'manual',$4)
             ON CONFLICT(staff_user_id, role_id) DO UPDATE SET
               revoked_at = NULL,
               revoked_by_staff_id = NULL,
               assigned_by_staff_id = EXCLUDED.assigned_by_staff_id,
               assignment_source = 'manual',
               note = EXCLUDED.note,
               assigned_at = now()`,
            [staffId, role.id, identity.staffId, input.note ?? null],
          );
          await client.query(
            `INSERT INTO staff_role_assignment_logs(
               staff_user_id, role_id, action, actor_staff_id, reason, request_id, ip_address, metadata
             ) VALUES($1,$2,'assigned',$3,$4,$5,$6,$7::jsonb)`,
            [staffId, role.id, identity.staffId, input.note ?? "Initial role assignment", requestMeta(req).requestId, requestMeta(req).ipAddress, JSON.stringify({ source: "staff.create" })],
          );
        }
        await client.query("COMMIT");
        res.status(201).json({ id: staffId });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) { sendError(res, error); }
  });

  router.patch("/:staffId", async (req, res) => {
    try {
      const identity = requireStaffIdentity(await identityResolver(req));
      await requirePermission(identity, "staff.manage");
      const input = updateStaffSchema.parse(req.body ?? {});
      if (req.params.staffId === identity.staffId && input.isActive === false) {
        throw new OrderEngineError("SELF_DEACTIVATION_FORBIDDEN", 409, "You cannot deactivate your own account");
      }
      const result = await getDb().query(
        `UPDATE staff_users
         SET name = COALESCE($2, name),
             is_active = COALESCE($3, is_active),
             updated_at = now()
         WHERE id = $1
         RETURNING id::text, clerk_user_id, email, name, role AS legacy_role, is_active, updated_at`,
        [req.params.staffId, input.name ?? null, input.isActive ?? null],
      );
      if (!result.rows[0]) throw new OrderEngineError("STAFF_NOT_FOUND", 404, "Staff user not found");
      res.json({ staff: result.rows[0] });
    } catch (error) { sendError(res, error); }
  });

  router.put("/:staffId/roles/:roleKey", async (req, res) => {
    try {
      const identity = requireStaffIdentity(await identityResolver(req));
      await requirePermission(identity, "staff.roles.assign");
      const input = roleMutationSchema.parse(req.body ?? {});
      if (req.params.staffId === identity.staffId) {
        throw new OrderEngineError("SELF_ROLE_ASSIGNMENT_FORBIDDEN", 409, "You cannot assign a role to yourself");
      }
      const role = await assertRoleAssignable(req.params.roleKey);
      const meta = requestMeta(req);
      const client = await getDb().connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO staff_role_assignments(
             staff_user_id, role_id, assigned_by_staff_id, assignment_source, note
           ) VALUES($1,$2,$3,'manual',$4)
           ON CONFLICT(staff_user_id, role_id) DO UPDATE SET
             revoked_at = NULL,
             revoked_by_staff_id = NULL,
             assigned_by_staff_id = EXCLUDED.assigned_by_staff_id,
             assignment_source = 'manual',
             note = EXCLUDED.note,
             assigned_at = now()`,
          [req.params.staffId, role.id, identity.staffId, input.reason],
        );
        await client.query(
          `INSERT INTO staff_role_assignment_logs(
             staff_user_id, role_id, action, actor_staff_id, reason, request_id, ip_address, metadata
           ) VALUES($1,$2,'assigned',$3,$4,$5,$6,'{}'::jsonb)`,
          [req.params.staffId, role.id, identity.staffId, input.reason, meta.requestId, meta.ipAddress],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (error) { sendError(res, error); }
  });

  router.delete("/:staffId/roles/:roleKey", async (req, res) => {
    try {
      const identity = requireStaffIdentity(await identityResolver(req));
      await requirePermission(identity, "staff.roles.assign");
      const input = roleMutationSchema.parse(req.body ?? {});
      if (req.params.staffId === identity.staffId) {
        throw new OrderEngineError("SELF_ROLE_REVOCATION_FORBIDDEN", 409, "You cannot revoke your own role");
      }
      const role = await assertRoleAssignable(req.params.roleKey);
      if (role.role_key === "super_admin") {
        const countResult = await getDb().query<{ count: number }>(
          `SELECT count(*)::int AS count
           FROM staff_role_assignments assignment
           JOIN rbac_roles role ON role.id = assignment.role_id
           JOIN staff_users staff ON staff.id = assignment.staff_user_id
           WHERE role.role_key = 'super_admin'
             AND assignment.revoked_at IS NULL
             AND staff.is_active = true`,
        );
        if (countResult.rows[0].count <= 1) {
          throw new OrderEngineError("LAST_SUPER_ADMIN_FORBIDDEN", 409, "Cannot revoke the last active super admin");
        }
      }
      const meta = requestMeta(req);
      const db = getDb();
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `UPDATE staff_role_assignments
           SET revoked_at = now(), revoked_by_staff_id = $3
           WHERE staff_user_id = $1 AND role_id = $2 AND revoked_at IS NULL
           RETURNING staff_user_id`,
          [req.params.staffId, role.id, identity.staffId],
        );
        if (!result.rows[0]) throw new OrderEngineError("ROLE_ASSIGNMENT_NOT_FOUND", 404, "Active role assignment not found");
        await client.query(
          `INSERT INTO staff_role_assignment_logs(
             staff_user_id, role_id, action, actor_staff_id, reason, request_id, ip_address, metadata
           ) VALUES($1,$2,'revoked',$3,$4,$5,$6,'{}'::jsonb)`,
          [req.params.staffId, role.id, identity.staffId, input.reason, meta.requestId, meta.ipAddress],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      res.json({ ok: true });
    } catch (error) { sendError(res, error); }
  });

  return router;
}
