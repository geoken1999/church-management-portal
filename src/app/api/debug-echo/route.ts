import { NextResponse } from "next/server";

// TEMPORARY — diagnosing why a known-correct Authorization header isn't
// matching server-side in another route. Deleted immediately after use.
export async function GET(request: Request) {
  return NextResponse.json({
    authorizationHeaderReceived: request.headers.get("authorization"),
    allHeaderNames: Array.from(request.headers.keys()),
  });
}
