import { NextResponse } from "next/server";
import { withAdminScope } from "@/lib/admin-app/auth";

// Who is signed in to the admin app and what they may open. The app shows only the screens in `scopes`.
export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  withAdminScope(request, null, async (caller) =>
    NextResponse.json({
      ok: true,
      email: caller.email,
      name: caller.name,
      role: caller.role,
      scopes: caller.scopes,
    }),
  );
