"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Push notifications are opt-in per device — tracks subscription and handles iOS PWA requirements. */
export function usePush() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect iOS device (iPhone/iPad)
    const ios =
      typeof navigator !== "undefined" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setIsIOS(ios);

    // Detect if running as installed Home Screen standalone PWA
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true);
    setIsStandalone(standalone);

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }

    setSupported(true);
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      })
      .catch((err) => {
        console.warn("Service worker registration error:", err);
      });
  }, []);

  async function subscribe() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      setError("VAPID public key is not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notification permission was denied. Please allow notifications in your device/browser settings.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      await api("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setSubscribed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to enable push notifications.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/subscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to disable push notifications.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setError(null);
    try {
      await api("/api/push/test", { method: "POST" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send test push.";
      setError(msg);
    }
  }

  return {
    supported,
    subscribed,
    loading,
    error,
    isIOS,
    isStandalone,
    subscribe,
    unsubscribe,
    sendTest,
  };
}
