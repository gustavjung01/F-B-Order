"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

type NotificationStatus = "unsupported" | "default" | "granted" | "denied";

declare global {
  interface Window {
    OneSignal?: { login?: (id: string) => Promise<void> | void };
    requestOneSignalNotificationPermission?: () => Promise<NotificationStatus>;
  }
}

function readNotificationStatus(): NotificationStatus {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function getStatusLabel(status: NotificationStatus) {
  if (status === "granted") return "Đã bật";
  if (status === "denied") return "Bị chặn";
  if (status === "unsupported") return "Không hỗ trợ";
  return "Chưa bật";
}

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const { user } = useUser();
  const [status, setStatus] = useState<NotificationStatus>("default");

  useEffect(() => {
    setStatus(readNotificationStatus());
  }, []);

  async function enable() {
    if (!user) return;

    if (window.OneSignal?.login) {
      await window.OneSignal.login(user.id);
    }

    const nextStatus = await window.requestOneSignalNotificationPermission?.();
    setStatus(nextStatus ?? readNotificationStatus());
  }

  const label = getStatusLabel(status);

  return (
    <button
      type="button"
      title={`Thông báo: ${label}`}
      onClick={enable}
      className={
        compact
          ? "grid h-9 w-9 place-items-center rounded-full bg-white text-orange-500 shadow-sm ring-1 ring-[#eee7dc]"
          : "inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-orange-500 shadow-sm ring-1 ring-[#eee7dc]"
      }
    >
      <span aria-hidden="true">🔔</span>
      {!compact && <span>{label}</span>}
    </button>
  );
}
