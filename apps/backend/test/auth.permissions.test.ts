import test from "node:test";
import assert from "node:assert/strict";
import { assertPermissionSet } from "../src/modules/auth/auth.permissions.ts";
import { assertDifferentApprover } from "../src/modules/ai/ai.routes.ts";

const operations = [
  "orders.view",
  "orders.update",
  "orders.internal_notes",
  "customers.view",
  "customers.update",
  "catalog.view",
  "recipes.view",
] as const;

test("operations cannot assign staff roles", () => {
  assert.throws(
    () => assertPermissionSet(operations, "staff.roles.assign"),
    (error: unknown) => {
      const value = error as { code?: string; status?: number; details?: unknown };
      return value.code === "PERMISSION_DENIED" && value.status === 403;
    },
  );
});

test("recipe editor cannot publish recipes", () => {
  const recipeEditor = ["catalog.view", "recipes.view", "recipes.edit", "recipes.media.manage", "ai.use"] as const;
  assert.throws(() => assertPermissionSet(recipeEditor, "recipes.publish"), /Missing required permission/);
});

test("recipe publisher cannot edit catalog pricing", () => {
  const recipePublisher = ["catalog.view", "recipes.view", "recipes.review", "recipes.publish", "ai.use"] as const;
  assert.throws(() => assertPermissionSet(recipePublisher, "catalog.pricing"), /Missing required permission/);
});

test("granted permission passes", () => {
  assert.doesNotThrow(() => assertPermissionSet(operations, "orders.update"));
});


test("AI requester cannot approve own action", () => {
  assert.throws(
    () => assertDifferentApprover("staff-1", "staff-1"),
    (error: unknown) => {
      const value = error as { code?: string; status?: number };
      return value.code === "SELF_APPROVAL_FORBIDDEN" && value.status === 409;
    },
  );
});

test("different approver is accepted", () => {
  assert.doesNotThrow(() => assertDifferentApprover("staff-1", "staff-2"));
});
