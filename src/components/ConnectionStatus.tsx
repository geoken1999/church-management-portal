"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";

// A slim bar across the top whenever the browser loses its connection, so a
// failed save or a stalled page reads as "you're offline" instead of the app
// seeming broken. On reconnect it refreshes the current route's server data
// (anything that failed to load while offline is fetched again) and
// confirms briefly. Forms are not retried automatically: a half-sent save
// can't be known to be safe to replay, so the user re-submits.
export function ConnectionStatus() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [justRestored, setJustRestored] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleOnline = () => {
      setJustRestored(true);
      router.refresh();
      timer = setTimeout(() => setJustRestored(false), 3000);
    };
    const handleOffline = () => {
      clearTimeout(timer);
      setJustRestored(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router]);

  if (online && !justRestored) return null;

  const offline = !online;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium ${
        offline ? "bg-destructive text-white" : "bg-primary text-primary-foreground"
      }`}
    >
      {offline ? <WifiOff className="size-4" /> : <Wifi className="size-4" />}
      {offline ? "You're offline. Changes can't be saved until your connection returns." : "Back online."}
    </div>
  );
}
