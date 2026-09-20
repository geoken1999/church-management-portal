"use client";

import dynamic from "next/dynamic";
import type { YouTubeDashboardData } from "@/lib/youtube/dal";

// YouTubeManager renders several locale-dependent dates (toLocaleString/
// toLocaleDateString with the runtime's default locale) and "time ago" text
// computed from Date.now() — both differ between the Node server process
// and the visitor's browser, which is a guaranteed hydration mismatch if
// server-rendered. This page has no SEO value (authenticated dashboard),
// so the fix is to skip SSR for it entirely rather than patch every
// formatting call site. `ssr: false` isn't allowed directly in a Server
// Component in this Next.js version, hence this thin client wrapper.
const YouTubeManager = dynamic(() => import("./YouTubeManager").then((mod) => mod.YouTubeManager), {
  ssr: false,
});

export function YouTubeManagerClient(props: {
  organizationId: string;
  canManage: boolean;
  data: YouTubeDashboardData;
}) {
  return <YouTubeManager {...props} />;
}
