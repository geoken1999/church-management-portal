// A tiny answer, for measuring how long a round trip to the server takes.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
