import { NextResponse } from "next/server";

// Lets the KingdomFlow iPhone app open K-Connect invite links (/kmeet/<id>,
// /kaudio/<id>) directly. Needs APPLE_TEAM_ID (the 10-character Apple team id);
// without it this answers with no apps, and the links simply open in the browser.
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  const details = teamId ? [{ appIDs: [`${teamId}.com.nexora.kingdomflow`], components: [{ "/": "/kmeet/*" }, { "/": "/kaudio/*" }] }] : [];
  return NextResponse.json({ applinks: { details } }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
