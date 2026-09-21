"use client";

import dynamic from "next/dynamic";
import type { FacebookDashboardData } from "@/lib/facebook/dal";

// Same reasoning as YouTubeManagerClient/InstagramManagerClient — FacebookManager
// formats dates with the runtime's default locale and computes "time ago" text
// from Date.now(), both of which differ between server and browser. Skipping
// SSR here removes the mismatch outright instead of patching every call site.
const FacebookManager = dynamic(() => import("./FacebookManager").then((mod) => mod.FacebookManager), {
  ssr: false,
});

export function FacebookManagerClient(props: {
  organizationId: string;
  canManage: boolean;
  status?: string;
  data: FacebookDashboardData;
}) {
  return <FacebookManager {...props} />;
}
