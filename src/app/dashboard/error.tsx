"use client";

import { useEffect } from "react";
import { WifiOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/lib/use-online-status";

// Without this, a dashboard page that throws while loading (most often
// because the connection dropped mid-navigation) shows Next's generic error
// screen. This says what likely happened and retries the page's data.
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const offline = !useOnlineStatus();

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    // Retry on its own the moment the connection comes back.
    if (!offline) return;
    const handleOnline = () => retry();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [offline, retry]);

  const Icon = offline ? WifiOff : TriangleAlert;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <Icon className="size-10 text-muted-foreground" />
      <h2 className="font-heading text-xl font-semibold">{offline ? "You're offline" : "Something went wrong"}</h2>
      <p className="text-sm text-muted-foreground">
        {offline
          ? "This page couldn't load because your device has no internet connection. It will reload on its own once you're back online."
          : "This page couldn't load. If your connection is unstable, try again in a moment."}
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
