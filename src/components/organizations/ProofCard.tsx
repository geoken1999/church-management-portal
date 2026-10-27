"use client";

import { useRef, useState } from "react";
import { BadgeCheck, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { startProofUpload, submitProof } from "@/lib/organizations/proof-actions";
import { PROOF_BUCKET, type VerificationStatus } from "@/lib/organizations/proof";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const COPY: Record<VerificationStatus, { label: string; detail: string }> = {
  not_submitted: {
    label: "Document needed",
    detail: "Send your church's registration certificate (or another official document showing the church's name) so KingdomFlow can verify it.",
  },
  under_review: { label: "Under review", detail: "We have your document and will check it. You will get a notification here." },
  verified: { label: "Verified", detail: "Your church is verified. Everything in KingdomFlow is open to you." },
  rejected: { label: "Document not accepted", detail: "Please send a clearer or different document." },
};

// Profile → Verification: send the registration document and see what the platform decided.
export function ProofCard({
  status,
  note,
  documentName,
  canManage,
}: {
  status: VerificationStatus;
  note: string | null;
  documentName: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      const start = await startProofUpload(file.name, file.size);
      if (start.error || !start.path || !start.token) return setError(start.error ?? "Couldn't start the upload.");
      const { error: uploadError } = await createBrowserClient().storage.from(PROOF_BUCKET).uploadToSignedUrl(start.path, start.token, file);
      if (uploadError) return setError(`The upload failed (${uploadError.message}). Check your connection and try again.`);
      const saved = await submitProof(start.path, file.name);
      if (saved.error) return setError(saved.error);
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const copy = COPY[status];
  const canSend = canManage && (status === "not_submitted" || status === "rejected");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-primary" />
          Verification
        </CardTitle>
        <CardDescription>Proof that your church is registered</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === "verified" ? "secondary" : status === "rejected" ? "destructive" : "outline"}>{copy.label}</Badge>
          {documentName && status !== "not_submitted" && <span className="text-muted-foreground">{documentName}</span>}
        </div>
        <p className="text-muted-foreground">{status === "rejected" && note ? note : copy.detail}</p>
        {canSend && (
          <>
            <input
              ref={input}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && send(e.target.files[0])}
            />
            <Button type="button" disabled={busy} onClick={() => input.current?.click()}>
              <Upload className="size-4" />
              {busy ? "Sending…" : status === "rejected" ? "Send a new document" : "Choose and send document"}
            </Button>
            <p className="text-xs text-muted-foreground">A photo (JPG, PNG) or a PDF, up to 5 MB.</p>
          </>
        )}
        {!canManage && status !== "verified" && <p className="text-xs text-muted-foreground">Only an owner or admin can send the document.</p>}
        {error && <p className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
