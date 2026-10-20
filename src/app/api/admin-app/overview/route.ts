import { NextResponse } from "next/server";
import { withAdminScope } from "@/lib/admin-app/auth";
import { getPlatformOverview } from "@/lib/platform-admin/dal";

export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  withAdminScope(request, "overview", async () =>
    NextResponse.json({ ok: true, overview: await getPlatformOverview() }),
  );
