import { NextResponse } from "next/server";
import { withAdminScope } from "@/lib/admin-app/auth";
import { getAllTenants, getTenantUsage } from "@/lib/platform-admin/dal";

export const dynamic = "force-dynamic";

// The list of churches, or one church's details with ?id=.
export const GET = (request: Request) =>
  withAdminScope(request, "churches", async () => {
    const id = new URL(request.url).searchParams.get("id");
    if (!id)
      return NextResponse.json({ ok: true, churches: await getAllTenants() });
    if (!/^[0-9a-f-]{36}$/i.test(id))
      return NextResponse.json(
        { ok: false, error: "That church could not be found." },
        { status: 404 },
      );
    const usage = await getTenantUsage(id);
    if (!usage)
      return NextResponse.json(
        { ok: false, error: "That church could not be found." },
        { status: 404 },
      );
    return NextResponse.json({ ok: true, church: usage });
  });
