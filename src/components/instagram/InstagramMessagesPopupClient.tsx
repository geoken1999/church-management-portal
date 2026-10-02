"use client";

import dynamic from "next/dynamic";
import type { InstagramDashboardData } from "@/lib/instagram/dal";

// Same reasoning as InstagramManagerClient — avoids a server/client
// hydration mismatch from locale- and Date.now()-dependent formatting.
const InstagramMessagesStandalone = dynamic(
  () => import("./InstagramManager").then((mod) => mod.InstagramMessagesStandalone),
  { ssr: false },
);

export function InstagramMessagesPopupClient({
  organizationId,
  data,
}: {
  organizationId: string;
  data: InstagramDashboardData;
}) {
  if (!data.connected) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Instagram isn&apos;t connected for this organization.
      </div>
    );
  }

  return (
    <InstagramMessagesStandalone
      organizationId={organizationId}
      profileUsername={data.profile.username}
      initialConversations={data.conversations}
    />
  );
}
