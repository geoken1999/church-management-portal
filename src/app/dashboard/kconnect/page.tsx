import type { Metadata } from "next";
import Link from "next/link";
import { Headphones, Video, Webcam } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { getKmeetMeetings, getUpcomingEventOptions } from "@/lib/kmeet/dal";
import { isVideoSdkConfigured } from "@/lib/kmeet/env";
import { tabKeyForMode } from "@/lib/kmeet/mode";
import { getKmeetMinutes } from "@/lib/kmeet/minutes-service";
import { getCheckoutContext } from "@/lib/billing/checkout-context";
import { isRazorpayConfigured } from "@/lib/billing/env";
import { KmeetMinutesCard } from "@/components/kmeet/KmeetMinutesCard";
import { KmeetManager } from "@/components/kmeet/KmeetManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import type { KmeetMode } from "@/types/database";

export const metadata: Metadata = {
  title: "K-Connect | KingdomFlow",
};

// K-Connect: video and audio calls on one page. Each kind keeps its own
// permission (the K-Meet and K-Audio tabs), so a person sees the kinds they
// are allowed to use.
export default async function KconnectPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; minutes?: string }>;
}) {
  const { mode: requested, minutes: minutesParam } = await searchParams;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  const allowed = (["video", "audio"] as KmeetMode[]).filter(
    (m) => membership.tabAccess[tabKeyForMode(m)].read,
  );
  if (allowed.length === 0) return <AccessRestricted label="K-Connect" />;
  const mode: KmeetMode = allowed.includes(requested as KmeetMode)
    ? (requested as KmeetMode)
    : allowed[0];
  const access = membership.tabAccess[tabKeyForMode(mode)];

  const [meetings, eventOptions, minutes, checkout] = await Promise.all([
    getKmeetMeetings(organizationId, mode),
    getUpcomingEventOptions(organizationId),
    getKmeetMinutes(organizationId),
    getCheckoutContext(organizationId),
  ]);
  const upcoming = meetings.filter((m) => m.status !== "ended");
  const past = meetings.filter((m) => m.status === "ended");

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            K-Connect
          </h1>
          <p className="mt-1 text-muted-foreground">
            {mode === "video" ? "Video calls" : "Audio-only calls"} — start one
            instantly or schedule one for later.
          </p>
        </div>
        <Link href="/dashboard/kconnect/conferencing" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <Video className="size-4" /> Zoom and Google Meet
        </Link>
        {allowed.length > 1 && (
          <div className="inline-flex rounded-lg border border-border p-1">
            {allowed.map((m) => (
              <Link
                key={m}
                href={`/dashboard/kconnect?mode=${m}`}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "video" ? (
                  <Webcam className="size-4" />
                ) : (
                  <Headphones className="size-4" />
                )}
                {m === "video" ? "Video" : "Audio"}
              </Link>
            ))}
          </div>
        )}
      </div>

      <KmeetMinutesCard
        minutes={minutes}
        canBuy={membership.role === "owner" || membership.role === "admin"}
        paymentsConfigured={isRazorpayConfigured()}
        billingDetails={checkout.billingDetails}
        sellerState={checkout.sellerState}
        justBought={minutesParam === "bought"}
      />

      <KmeetManager
        key={mode}
        mode={mode}
        canWrite={access.write}
        available={isVideoSdkConfigured()}
        events={eventOptions}
        upcoming={upcoming}
        past={past}
        timezone={membership.organization.timezone}
      />
    </div>
  );
}
