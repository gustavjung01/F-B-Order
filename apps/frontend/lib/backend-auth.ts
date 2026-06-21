import { auth } from "@clerk/nextjs/server";

export async function getBackendAuthorizationHeaders(): Promise<Headers | null> {
  const session = await auth();
  const token = await session.getToken();
  if (!token) return null;
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  return headers;
}
