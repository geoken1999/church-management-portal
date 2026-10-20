import { NextResponse } from "next/server";
import { withAdminScope } from "@/lib/admin-app/auth";
import { getMobileHealth } from "@/lib/mobile-health/dal";
import { getPlatformEvents } from "@/lib/platform-admin/dal";

export const dynamic = "force-dynamic";

// App health (crash-free rate, versions, recent crashes and errors with their logs) and the latest platform
// events. ?level=error|warning|info narrows the events.
export const GET = (request: Request) =>
  withAdminScope(request, "health", async () => {
    const level = new URL(request.url).searchParams.get("level");
    const [health, events] = await Promise.all([
      getMobileHealth(),
      getPlatformEvents({
        level:
          level === "error" || level === "warning" || level === "info"
            ? level
            : undefined,
        limit: 60,
      }),
    ]);
    return NextResponse.json({ ok: true, health, events });
  });
