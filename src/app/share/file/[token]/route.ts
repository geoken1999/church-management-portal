import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Masked, opt-in Folder document sharing: the link handed out is
// /share/file/{token}, never the underlying Storage path. Distinct from
// worship's /share/document/{token} — same convention, different route,
// since the two modules' share tokens/RPCs aren't interchangeable. The
// token is resolved via a SECURITY DEFINER RPC (get_shared_document —
// returns a row only when share_enabled is true), so a disabled link 404s
// immediately. Unlike worship-documents, the shared-documents bucket is
// PRIVATE, so we can't read a public bucket URL — the admin (service role)
// client mints a short-lived signed URL, which this route then proxies
// rather than redirecting to, keeping the bucket path out of the browser
// entirely.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_document", { token });

  const document = data?.[0];
  if (error || !document) {
    return new NextResponse("Document not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage.from("shared-documents").createSignedUrl(document.file_path, 60);
  if (signError || !signed) {
    return new NextResponse("Document not found.", { status: 404 });
  }

  const fileResponse = await fetch(signed.signedUrl);
  if (!fileResponse.ok || !fileResponse.body) {
    return new NextResponse("Document not found.", { status: 404 });
  }

  const extension = document.file_path.split(".").pop();
  const filename = (extension ? `${document.title}.${extension}` : document.title).replace(/"/g, "");

  return new NextResponse(fileResponse.body, {
    headers: {
      "Content-Type": document.file_type,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-cache",
    },
  });
}
