import { House } from "lucide-react";
import { approveFamilyRequest, rejectFamilyRequest } from "@/lib/families/actions";
import type { FamilyRequest } from "@/types/database";
import { ReviewButtons } from "@/components/ui/review-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Person = { id: string; first_name: string; last_name: string };
export type FamilyRequestRow = FamilyRequest & {
  requester: { first_name: string; last_name: string | null } | null;
};

// Families members asked for from the mobile app. Approving creates the family and puts
// everyone in it; rejecting just tells the member.
export function FamilyRequestsCard({
  requests,
  members,
  canReview,
}: {
  requests: FamilyRequestRow[];
  members: Person[];
  canReview: boolean;
}) {
  if (requests.length === 0) return null;
  const nameOf = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m ? `${m.first_name} ${m.last_name}`.trim() : "Former member";
  };
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <House className="size-4" /> Family requests ({requests.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="rounded-lg border p-3">
            <p className="font-medium">
              {r.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                asked by {r.requester ? `${r.requester.first_name} ${r.requester.last_name ?? ""}`.trim() : "a member"}
              </span>
            </p>
            <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
              <li>
                {r.requester ? r.requester.first_name : "Requester"} — {r.requester_relationship}
              </li>
              {(r.people ?? []).map((p) => (
                <li key={p.member_id}>
                  {nameOf(p.member_id)} — {p.relationship}
                </li>
              ))}
            </ul>
            {r.notes ? <p className="mt-2 text-sm">{r.notes}</p> : null}
            {canReview ? (
              <div className="mt-3">
                <ReviewButtons approve={approveFamilyRequest} reject={rejectFamilyRequest} field="requestId" value={r.id} />
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
