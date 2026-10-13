// Some bytes to download, for measuring download speed. At most 3 MB per request.
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;

export function GET(request: Request) {
  const kb = Number(new URL(request.url).searchParams.get("kb"));
  const bytes = Math.min(MAX_BYTES, Math.max(1024, Number.isFinite(kb) ? Math.floor(kb) * 1024 : 1024 * 1024));
  // Random so compression can't shrink it.
  const body = new Uint8Array(bytes);
  for (let offset = 0; offset < bytes; offset += 65536) crypto.getRandomValues(body.subarray(offset, Math.min(offset + 65536, bytes)));
  return new Response(body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "Content-Length": String(bytes) } });
}
