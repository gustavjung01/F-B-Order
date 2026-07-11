"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    OneSignal?: {
      login?: (id: string) => Promise<void> | void;
    };
  }
}

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { user } = useUser();
  const [status, setStatus] = useState("Chưa bật");

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setStatus(Notification.permission === "granted" ? "Đã bật" : Notification.permission === "denied" ? "Bị chặn" : "Chưa bật");
  }, []);

  async function enable() {
    const permission = await Notification.requestPermission();
    setStatus(permission === "granted" ? "Đã bật" : permission === "denied" ? "Bị chặn" : "Chưa bật");
    if (permission === "granted" && user?.id && window.OneSignal?.login) {
      await window.OneSignal.login(user.id);
    }
  }

  return (
    <button type="button" onClick={enable} title={status} className={compact ? "grid h-9 w-9 place-items-center rounded-full bg-white" : "inline-flex items-center gap-2 rounded-full bg-white px-4 py-2"}>
      <span aria-hidden="true">🔔</span>
      {!compact && <span>{status}</span>}
    </button>
  );
}
