import { auth, currentUser } from "@clerk/nextjs/server";
import { getBackendApiUrl } from "./backend-api";
import {
  ADMIN_ENTRY_PERMISSIONS,
  hasAnyAdminPermission,
  type AdminPermission,
} from "./admin-permissions";

type StaffMeResponse = {
  identityKind?: string;
  permissions?: string[];
};

export type AdminAccess = {
  isSignedIn: boolean;
  isAdmin: boolean;
  email: string | null;
  permissions: AdminPermission[];
};

export async function getAdminAccess(): Promise<AdminAccess> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return { isSignedIn: false, isAdmin: false, email: null, permissions: [] };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  const token = await getToken();
  if (!token) {
    return { isSignedIn: true, isAdmin: false, email, permissions: [] };
  }

  try {
    const response = await fetch(getBackendApiUrl("/api/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return { isSignedIn: true, isAdmin: false, email, permissions: [] };
    }

    const payload = (await response.json()) as StaffMeResponse;
    const permissions = (payload.permissions ?? []).filter((permission): permission is AdminPermission =>
      typeof permission === "string",
    );
    const isAdmin = payload.identityKind === "staff" && hasAnyAdminPermission(permissions, ADMIN_ENTRY_PERMISSIONS);
    return { isSignedIn: true, isAdmin, email, permissions };
  } catch {
    return { isSignedIn: true, isAdmin: false, email, permissions: [] };
  }
}
