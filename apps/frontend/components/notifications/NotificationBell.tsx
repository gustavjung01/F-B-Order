"use client";

import { useEffect, useState } from "react";

type PermissionStatus = "default" | "denied" | "granted" | "unsupported";

declare global {
  interface Window {
    requestOneSignalNotificationPermission?: () => Promise<PermissionStatus>;
  }
}

function readPermission(): PermissionStatus {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function labelFor(permission: PermissionStatus) {
  if (permission === "granted") return "Đã bật";
  if (permission === "denied") return "Bị chặn";
  if (permission === "unsupported") return "Không hỗ trợ";
  return "Chưa bật";
}

export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const [permission, setPermission] = useState<PermissionStatus>("default");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setPermission(readPermission());
  }, []);

  async function enable() {
    if (requesting) return;

    setRequesting(true);
    try {
      const requestPermission = window.requestOneSignalNotificationPermission;
      const nextPermission = requestPermission
        ? await requestPermission()
        : typeof Notification !== "undefined" && typeof Notification.requestPermission === "function"
          ? await Notification.requestPermission()
          : "unsupported";

      setPermission(nextPermission);
    } finally {
      setRequesting(false);
    }
  }

  const status = requesting ? "Đang bật..." : labelFor(permission);

  return (
    <button
      type="button"
      onClick={() => void enable()}
      title={status}
      aria-label={`Thông báo: ${status}`}
      disabled={requesting || permission === "unsupported"}
      className={compact
        ? "grid h-9 w-9 place-items-center rounded-full bg-white text-[17px] font-black text-[#ff5a00] shadow-sm ring-1 ring-[#eee7dc] disabled:cursor-not-allowed disabled:opacity-60"
        : "inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"}
    >
      <span aria-hidden="true">🔔</span>
      {!compact && <span>{status}</span>}
    </button>
  );
}