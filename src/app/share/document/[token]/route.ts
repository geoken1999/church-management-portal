import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Masked document sharing: the link handed out is /share/document/{token},
// never the underlying Storage path. This route resolves the token via a
// SECURITY DEFINER RPC (so it works for logged-out visitors), then proxies
// the file bytes through our own domain rather than redirecting to the
// Storage CDN URL directly.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_worship_document", { token });

  const document = data?.[0];
  if (error || !document) {
    return new NextResponse("Document not found.", { status: 404 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("worship-documents").getPublicUrl(document.file_path);

  const fileResponse = await fetch(publicUrl);
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
