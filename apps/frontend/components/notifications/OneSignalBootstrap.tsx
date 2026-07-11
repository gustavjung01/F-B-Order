"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";

type NotificationPermissionState = "default" | "denied" | "granted" | "unsupported";

type OneSignalPushSubscription = {
  id?: string | null;
  optedIn?: boolean;
  token?: string | null;
};

type OneSignalNotifications = {
  permission?: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
};

type OneSignalClient = {
  login?: (externalId: string) => Promise<void> | void;
  init: (options: {
    appId: string;
    serviceWorkerPath?: string;
    serviceWorkerUpdaterPath?: string;
  }) => Promise<void> | void;
  Notifications?: OneSignalNotifications;
  User?: {
    PushSubscription?: OneSignalPushSubscription;
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalClient) => void | Promise<void>>;
    requestOneSignalNotificationPermission?: () => Promise<NotificationPermissionState>;
  }
}

type OneSignalBootstrapProps = {
  appId: string;
  enabled: boolean;
};

function getBrowserNotificationPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

async function logOneSignalState(OneSignal: OneSignalClient, label: string) {
  if (process.env.NODE_ENV === "production") return;

  const pushSubscription = OneSignal.User?.PushSubscription;
  console.info("[OneSignal]", label, {
    browserPermission: getBrowserNotificationPermission(),
    sdkPermission: OneSignal.Notifications?.permission ?? "unknown",
    subscriptionId: pushSubscription?.id ?? null,
    subscribed: pushSubscription?.optedIn ?? false,
    tokenPresent: Boolean(pushSubscription?.token),
  });
}

export function OneSignalBootstrap({ appId, enabled }: OneSignalBootstrapProps) {
  const { user } = useUser();
  useEffect(() => {
    if (!enabled || !appId) return;

    let cancelled = false;
    let script: HTMLScriptElement | null = null;

    const ready = new Promise<OneSignalClient>((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function (OneSignal) {
        if (cancelled) return;

        try {
          if ("serviceWorker" in navigator) {
            await navigator.serviceWorker.ready.catch(function () {
              return null;
            });
          }

          await OneSignal.init({
            appId,
            serviceWorkerPath: "/service-worker.js?onesignal=1",
            serviceWorkerUpdaterPath: "/service-worker.js?onesignal=1",
          });

          window.requestOneSignalNotificationPermission = async function () {
            if (typeof Notification === "undefined") return "unsupported";

            if (Notification.permission === "granted") {
              return "granted";
            }

            if (Notification.permission === "default" && OneSignal.Notifications?.requestPermission) {
              return OneSignal.Notifications.requestPermission();
            }

            if (Notification.permission === "default" && typeof Notification.requestPermission === "function") {
              return Notification.requestPermission();
            }

            return Notification.permission;
          };

          if (user?.id && OneSignal.login) {
            await OneSignal.login(user.id);
          }

          if (!cancelled) {
            await logOneSignalState(OneSignal, "initialized");
          }

          resolve(OneSignal);
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[OneSignal] Initialization failed.", error);
          }
          resolve(OneSignal);
        }
      });
    });

    if (!document.querySelector('script[data-onesignal-sdk="true"]')) {
      script = document.createElement("script");
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.async = true;
      script.defer = true;
      script.dataset.onesignalSdk = "true";
      script.addEventListener("error", function () {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[OneSignal] Failed to load the page SDK script.");
        }
      });
      document.head.appendChild(script);
    }

    if (process.env.NODE_ENV !== "production") {
      void ready.then(function (OneSignal) {
        void logOneSignalState(OneSignal, "ready");
      });
    }

    return function () {
      cancelled = true;
      if (window.requestOneSignalNotificationPermission) {
        delete window.requestOneSignalNotificationPermission;
      }
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [appId, enabled, user?.id]);

  return null;
}



