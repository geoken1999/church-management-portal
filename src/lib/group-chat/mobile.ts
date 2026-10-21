import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actorForGroup, type ChatActor } from "@/lib/group-chat/service";

// What the mobile routes share: who is calling (from the bearer token), and the chat actor for a group they are
// in. The person is always worked out from the token, never from the request body.
export const dynamic = "force-dynamic";

export const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status });
export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function authUserIdFromRequest(
  request: Request,
): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  if (!token) return null;
  const { data, error } = await createAdminClient().auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

/** The caller as a participant of this group, or a ready answer saying why not. */
export async function actorOrAnswer(
  request: Request,
  groupId: unknown,
): Promise<{ actor: ChatActor } | { answer: NextResponse }> {
  const userId = await authUserIdFromRequest(request);
  if (!userId)
    return {
      answer: json(
        { ok: false, error: "That session could not be verified." },
        401,
      ),
    };
  if (!isUuid(groupId))
    return {
      answer: json({ ok: false, error: "That group could not be found." }, 404),
    };
  const actor = await actorForGroup(userId, groupId);
  if (!actor)
    return {
      answer: json({ ok: false, error: "You are not in this group." }, 403),
    };
  return { actor };
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
