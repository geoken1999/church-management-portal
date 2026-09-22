import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Downloads one file from a shared category. Re-validates both the
// category token (must be share_enabled) and that documentId actually
// belongs to that category via get_shared_category_document, so a guessed
// or stale document id from another org can't be pulled through a valid
// category link.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; documentId: string }> }) {
  const { token, documentId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_category_document", { token, doc_id: documentId });

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
