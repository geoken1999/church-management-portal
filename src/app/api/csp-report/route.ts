import { NextResponse } from "next/server";

// Where browsers send content-security-policy reports while the policy is in report-only mode (see
// next.config.ts). It only writes a short line to the server log: no database, nothing stored per person,
// and the body is cut off so it cannot be used to fill the logs.
const MAX_BYTES = 4000;

export async function POST(request: Request) {
  try {
    const text = (await request.text()).slice(0, MAX_BYTES);
    console.warn("[csp-report]", text.replace(/\s+/g, " "));
  } catch {
    // A report that cannot be read is not worth a failure.
  }
  return new NextResponse(null, { status: 204 });
}
