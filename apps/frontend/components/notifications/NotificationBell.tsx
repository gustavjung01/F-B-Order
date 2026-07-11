"use client";

import { useUser } from "@clerk/nextjs";
import { useState } from "react";

declare global {
  interface Window {
    OneSignal?: { login?: (id: string) => Promise<void> };
    requestOneSignalNotificationPermission?: () => Promise<"default" | "denied" | "granted" | "unsupported">;
  }
}

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { user } = useUser();
  const [status, setStatus] = useState("Chưa bật");

  async function enable() {
    if (!user) return;
    if (window.OneSignal?.login) await window.OneSignal.login(user.id);
    const result = await window.requestOneSignalNotificationPermission?.();
    setStatus(result === "denied" ? "Bị chặn" : "Đã bật");
  }

  return (
    <button type="button" title={`Thông báo: ${status}`} onClick={enable} className={compact ? "grid h-9 w-9 place-items-center rounded-full bg-white" : "inline-flex items-center gap-2 rounded-full bg-white px-4 py-2"}>
      <span>🔔</span>{!compact && <span>{status}</span>}
    </button>
  );
}

