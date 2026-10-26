import { NextResponse } from "next/server";
import { screenByToken } from "@/lib/projection/service";

// What the projector page shows right now. Public by design: the secret in the address is the access, so anyone the
// church gave the link to (a screen, OBS) can show the slide. It only ever says what is on the screen.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await screenByToken(token);
  if (!state) return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "no-store" } });
}
