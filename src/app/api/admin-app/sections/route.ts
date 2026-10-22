import { NextResponse } from "next/server";
import { withAdminScope } from "@/lib/admin-app/auth";
import { hasScope } from "@/lib/admin-app/scopes";
import { sectionByKey, sectionMenu } from "@/lib/admin-app/sections";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });

// GET: the menu of extra sections this person may open; with ?section=<key> (and ?filter=) one section's screen.
export const GET = (request: Request) =>
  withAdminScope(request, null, async (caller) => {
    const params = new URL(request.url).searchParams;
    const key = params.get("section");
    if (!key)
      return NextResponse.json({ ok: true, sections: sectionMenu(caller.scopes) });
    const section = sectionByKey(key);
    if (!section) return fail("That section doesn't exist.", 404);
    if (!hasScope(caller.scopes, section.scope))
      return fail("You don't have access to this.", 403);
    return NextResponse.json({
      ok: true,
      doc: await section.load(params.get("filter")),
    });
  });

// POST {section, action, id?, input?}: runs one action of a section.
export const POST = (request: Request) =>
  withAdminScope(request, null, async (caller) => {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid request.");
    }
    const section = typeof body.section === "string" ? sectionByKey(body.section) : undefined;
    if (!section?.act) return fail("That action doesn't exist.", 404);
    if (!hasScope(caller.scopes, section.scope))
      return fail("You don't have access to this.", 403);
    const action = typeof body.action === "string" ? body.action : "";
    const id = typeof body.id === "string" ? body.id : null;
    const raw = body.input && typeof body.input === "object" ? (body.input as Record<string, unknown>) : {};
    const input: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw))
      if (typeof v === "string") input[k] = v.slice(0, 4000);
    const result = await section.act(caller, action, id, input);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  });
