"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Re-reads the page's server data when any of [tables] changes for this church (Realtime;
// Row Level Security decides what this person is told). Changes that arrive together fold
// into one refresh.
export function LiveRefresh({ tables, organizationId }: { tables: string[]; organizationId: string }) {
  const router = useRouter();
  const key = tables.join(",");
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    };
    let channel = supabase.channel(`live-${key}-${organizationId}`);
    for (const table of key.split(",")) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `organization_id=eq.${organizationId}` },
        refresh,
      );
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [key, organizationId, router]);
  return null;
}
