// Takes whatever is sent and throws it away, for measuring upload speed. At most 3 MB.
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return new Response("Too big.", { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response("Too big.", { status: 413 });
  return new Response(JSON.stringify({ received: body.byteLength }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
