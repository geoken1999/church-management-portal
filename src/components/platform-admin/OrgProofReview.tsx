"use client";

import { useState, useTransition } from "react";
import { getOrgProofLink, reviewOrgProof } from "@/lib/organizations/proof-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface OrgProofRow {
  id: string;
  name: string;
  verification_status: "not_submitted" | "under_review" | "verified" | "rejected";
  proof_document_name: string | null;
  proof_submitted_at: string | null;
  verification_note: string | null;
}

const LABEL = { not_submitted: "No document", under_review: "To check", verified: "Verified", rejected: "Rejected" } as const;

export function OrgProofReview({ row }: { row: OrgProofRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function view() {
    setError(null);
    startTransition(async () => {
      const result = await getOrgProofLink(row.id);
      if (result.url) window.open(result.url, "_blank", "noopener");
      else setError(result.error ?? "Couldn't open the document.");
    });
  }

  function decide(decision: "verify" | "reject") {
    setError(null);
    startTransition(async () => {
      const result = await reviewOrgProof(row.id, decision, reason);
      if (result.error) setError(result.error);
      else setRejecting(false);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-base font-bold">{row.name}</h3>
              <Badge variant={row.verification_status === "rejected" ? "destructive" : "outline"}>{LABEL[row.verification_status]}</Badge>
            </div>
            {row.proof_document_name && (
              <p className="text-xs text-muted-foreground">
                {row.proof_document_name}
                {row.proof_submitted_at && ` · sent ${new Date(row.proof_submitted_at).toLocaleString("en-IN")}`}
              </p>
            )}
            {row.verification_note && row.verification_status === "rejected" && (
              <p className="text-xs text-muted-foreground">Reason given: {row.verification_note}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {row.proof_document_name && (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={view}>
                View document
              </Button>
            )}
            <Button type="button" size="sm" disabled={pending} onClick={() => decide("verify")}>
              Verify
            </Button>
            {row.verification_status === "under_review" && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setRejecting((v) => !v)}>
                Reject
              </Button>
            )}
          </div>
        </div>
        {rejecting && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why (the church sees this)"
              maxLength={300}
              className="min-w-56 flex-1"
              aria-label="Reason for rejecting"
            />
            <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => decide("reject")}>
              Send
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
