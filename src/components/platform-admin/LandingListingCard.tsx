"use client";

import { useState, useTransition } from "react";
import { Globe } from "lucide-react";
import { setLandingListedAction } from "@/lib/landing/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Super Admin: show this church on the public landing page (its name, logo and country only), or take it off. Nothing
// is listed unless it is switched on here, so agree it with the church first.
export function LandingListingCard({
  organizationId,
  listed,
  hasLogo,
}: {
  organizationId: string;
  listed: boolean;
  hasLogo: boolean;
}) {
  const [on, setOn] = useState(listed);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(next: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setLandingListedAction(organizationId, next).catch(
        () =>
          ({ error: "Something went wrong. Please try again." }) as {
            error?: string;
          },
      );
      if (result.error) setMessage(result.error);
      else {
        setOn(next);
        setMessage(
          next
            ? "Now shown on the landing page."
            : "Removed from the landing page.",
        );
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Show on the landing page</p>
          {on ? (
            <Badge>Shown</Badge>
          ) : (
            <Badge variant="outline">Not shown</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The public page lists this church&apos;s name, logo and country,
          nothing else.{" "}
          {hasLogo
            ? "Its logo will appear."
            : "It has no logo yet, so a round badge with its initials is used."}{" "}
          Only turn it on once the church has agreed.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={on ? "outline" : "default"}
            disabled={pending}
            onClick={() => save(!on)}
          >
            {on ? "Remove from landing page" : "Show on landing page"}
          </Button>
          {message && (
            <span className="text-xs text-muted-foreground">{message}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
