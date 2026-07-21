"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AdminPermission } from "../../lib/admin-permissions";

type AdminPermissionContextValue = {
  permissions: readonly AdminPermission[];
  has: (permission: AdminPermission) => boolean;
  hasAny: (required: readonly AdminPermission[]) => boolean;
};

const AdminPermissionContext = createContext<AdminPermissionContextValue | null>(null);

export function AdminPermissionProvider({
  permissions,
  children,
}: {
  permissions: readonly AdminPermission[];
  children: ReactNode;
}) {
  const value = useMemo<AdminPermissionContextValue>(
    () => ({
      permissions,
      has: (permission) => permissions.includes(permission),
      hasAny: (required) => required.some((permission) => permissions.includes(permission)),
    }),
    [permissions],
  );

  return <AdminPermissionContext.Provider value={value}>{children}</AdminPermissionContext.Provider>;
}

export function useAdminPermissions(): AdminPermissionContextValue {
  const context = useContext(AdminPermissionContext);
  if (!context) {
    throw new Error("useAdminPermissions must be used inside AdminPermissionProvider");
  }
  return context;
}
