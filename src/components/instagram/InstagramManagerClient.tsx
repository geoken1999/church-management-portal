"use client";

import dynamic from "next/dynamic";
import type { InstagramDashboardData } from "@/lib/instagram/dal";

// Same reasoning as YouTubeManagerClient — InstagramManager formats dates
// with the runtime's default locale and computes "time ago" text from
// Date.now(), both of which differ between server and browser. Skipping
// SSR here removes the mismatch outright instead of patching every call
// site; there's no SEO benefit to SSR-ing an authenticated dashboard page
// anyway.
const InstagramManager = dynamic(() => import("./InstagramManager").then((mod) => mod.InstagramManager), {
  ssr: false,
});

export function InstagramManagerClient(props: {
  organizationId: string;
  canManage: boolean;
  data: InstagramDashboardData;
}) {
  return <InstagramManager {...props} />;
}
