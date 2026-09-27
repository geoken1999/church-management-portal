"use client";

import { revokeSession } from "@/lib/platform-admin/actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

// A plain confirm() rather than a custom dialog — this app has no
// AlertDialog component yet, and one destructive-confirmation button isn't
// reason enough to introduce one. Killing a session is disruptive enough
// (it signs someone out of whatever they're doing) to warrant at least a
// native confirmation, unlike this app's other single-click destructive
// actions (e.g. EventsManager's Delete button).
export function RevokeSessionButton({ sessionId, userEmail }: { sessionId: string; userEmail: string }) {
  return (
    <form
      action={revokeSession}
      onSubmit={(event) => {
        if (!window.confirm(`Sign out ${userEmail}? They'll be signed out on their next request.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="userEmail" value={userEmail} />
      <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
        <LogOut className="size-3.5" />
        Sign out
      </Button>
    </form>
  );
}
