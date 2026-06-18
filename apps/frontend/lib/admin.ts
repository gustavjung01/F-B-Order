import { currentUser } from "@clerk/nextjs/server";

export type AdminAccess = {
  isSignedIn: boolean;
  isAdmin: boolean;
  email: string;
};

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || "";
  const admins = getAdminEmails();

  return {
    isSignedIn: Boolean(user),
    isAdmin: Boolean(email && admins.includes(email)),
    email,
  };
}

export async function requireAdmin() {
  const access = await getAdminAccess();
  return access.isAdmin;
}
