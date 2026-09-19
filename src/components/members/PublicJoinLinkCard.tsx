"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QrCodeDialog } from "@/components/members/QrCodeDialog";

export function PublicJoinLinkCard({
  orgSlug,
  orgName,
  siteUrl,
}: {
  orgSlug: string;
  orgName: string;
  siteUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  // Resolved server-side and passed in, rather than read from
  // window.location here — that would render differently during SSR vs.
  // client hydration and trigger a hydration mismatch.
  const link = `${siteUrl}/join/${orgSlug}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className="size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Public join link</p>
            <p className="truncate text-xs text-muted-foreground">{link}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <QrCodeDialog link={link} title={orgName} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
