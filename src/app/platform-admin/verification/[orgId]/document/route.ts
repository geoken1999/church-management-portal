import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { PROOF_BUCKET, proofContentType } from "@/lib/organizations/proof";
import { decryptBytes, isEncryptedPath, parseProofKey } from "@/lib/organizations/proof-crypto";

export const dynamic = "force-dynamic";

// A church's proof document, decrypted for the platform admin only. Never cached, never shown inline to anyone else.
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  await requirePlatformAdmin();
  const { orgId } = await params;
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("proof_document_path, proof_document_name").eq("id", orgId).maybeSingle();
  if (!org?.proof_document_path) return new NextResponse("No document was sent.", { status: 404 });

  const { data: blob, error } = await admin.storage.from(PROOF_BUCKET).download(org.proof_document_path);
  if (error || !blob) return new NextResponse("Couldn't open the document.", { status: 502 });
  let bytes: Buffer = Buffer.from(await blob.arrayBuffer());
  if (isEncryptedPath(org.proof_document_path)) {
    const key = parseProofKey(process.env.PROOF_ENCRYPTION_KEY);
    if (!key) return new NextResponse("PROOF_ENCRYPTION_KEY is not set on this server.", { status: 500 });
    try {
      bytes = decryptBytes(bytes, key);
    } catch {
      return new NextResponse("This document couldn't be decrypted (wrong key?).", { status: 500 });
    }
  }
  const type = proofContentType(org.proof_document_name ?? "") ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
