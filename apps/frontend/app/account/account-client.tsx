"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeResponse = {
  clerkUserId: string | null;
  sessionId: string | null;
  role: string;
};

export function AccountClient() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMe() {
      if (!isLoaded || !isSignedIn) return;

      try {
        const token = await getToken();
        const data = await apiFetch<MeResponse>("/api/auth/me", { token });
        setMe(data);
      } catch (err) {
        setError("Chưa lấy được thông tin tài khoản từ backend.");
      }
    }

    loadMe();
  }, [getToken, isLoaded, isSignedIn]);

  return (
    <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-teal-700">Clerk account</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Thông tin đăng nhập</h2>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>

      {me ? (
        <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-white">
          {JSON.stringify(me, null, 2)}
        </pre>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Đang chờ dữ liệu backend.</p>
      )}

      {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}
