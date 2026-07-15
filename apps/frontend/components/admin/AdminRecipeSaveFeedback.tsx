"use client";

import { useEffect, useState } from "react";
import {
  ADMIN_API_SUCCESS_EVENT,
  type AdminApiSuccessDetail,
} from "@/lib/admin-api";

function isRecipeSave(detail: AdminApiSuccessDetail): boolean {
  if (detail.method === "POST" && detail.path === "/api/admin/recipes") return true;
  return detail.method === "PATCH"
    && /^\/api\/admin\/recipes\/[0-9a-f-]{36}$/i.test(detail.path);
}

export function AdminRecipeSaveFeedback() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleSuccess = (event: Event) => {
      const detail = (event as CustomEvent<AdminApiSuccessDetail>).detail;
      if (!detail || !isRecipeSave(detail)) return;

      setMessage("Đã lưu công thức và ảnh.");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(""), 4000);
    };

    window.addEventListener(ADMIN_API_SUCCESS_EVENT, handleSuccess);
    return () => {
      window.removeEventListener(ADMIN_API_SUCCESS_EVENT, handleSuccess);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-2xl ring-1 ring-emerald-300 md:bottom-8"
    >
      ✓ {message}
    </div>
  );
}
