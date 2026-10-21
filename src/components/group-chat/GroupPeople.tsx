"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shield, UserMinus } from "lucide-react";
import {
  addMembersAction,
  addStaffAction,
  removeParticipantAction,
  setParticipantRoleAction,
  type WebParticipant,
} from "@/lib/group-chat/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorToast } from "@/components/ui/error-toast";

export interface MemberChoice {
  id: string;
  name: string;
  phone: string | null;
}
export interface TeamChoice {
  authUserId: string;
  name: string;
}

// Who is in the group: their roles, removing people, and adding church members (by name or mobile number) and
// team logins. A member without a login yet is in the group already and is notified once they sign in to the app.
export function GroupPeople({
  organizationId,
  groupId,
  participants,
  members,
  team,
  canWrite,
}: {
  organizationId: string;
  groupId: string;
  participants: WebParticipant[];
  members: MemberChoice[];
  team: TeamChoice[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inGroupMembers = useMemo(
    () =>
      new Set(participants.map((p) => p.memberId).filter(Boolean) as string[]),
    [participants],
  );
  const inGroupLogins = useMemo(
    () =>
      new Set(
        participants.map((p) => p.authUserId).filter(Boolean) as string[],
      ),
    [participants],
  );
  const term = query.trim().toLowerCase();
  const choices = members
    .filter((m) => !inGroupMembers.has(m.id))
    .filter(
      (m) =>
        !term ||
        m.name.toLowerCase().includes(term) ||
        (m.phone ?? "")
          .replace(/\D/g, "")
          .includes(term.replace(/\D/g, "") || "no-digits"),
    )
    .slice(0, 50);
  const teamChoices = team.filter((t) => !inGroupLogins.has(t.authUserId));

  function run(
    work: () => Promise<{ error?: string; added?: number }>,
    done?: (r: { added?: number }) => void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await work().catch(
        () =>
          ({
            error: "Something went wrong. Check your connection and try again.",
          }) as { error?: string; added?: number },
      );
      if (result.error) setError(result.error);
      else {
        done?.(result);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <ErrorToast message={error} />
      {notice && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">{notice}</p>
      )}

      <div className="space-y-2">
        {participants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nobody is in this group yet.
          </p>
        )}
        {participants.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                {p.role === "admin" && (
                  <Badge variant="secondary">
                    <Shield className="mr-1 size-3" /> Group admin
                  </Badge>
                )}
                {p.staff && <Badge variant="outline">Team</Badge>}
                {!p.hasLogin && (
                  <span className="text-xs text-muted-foreground">
                    has not signed in to the app yet
                  </span>
                )}
              </div>
              {canWrite && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setParticipantRoleAction(
                          organizationId,
                          groupId,
                          p.id,
                          p.role === "admin" ? "member" : "admin",
                        ),
                      )
                    }
                  >
                    {p.role === "admin" ? "Make member" : "Make admin"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    aria-label={`Remove ${p.name}`}
                    onClick={() =>
                      window.confirm(`Remove ${p.name} from this group?`) &&
                      run(() =>
                        removeParticipantAction(organizationId, groupId, p.id),
                      )
                    }
                  >
                    <UserMinus className="size-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {canWrite && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="font-medium">Add church members</p>
          <Input
            placeholder="Search by name or mobile number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {choices.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No one else to add.
              </p>
            )}
            {choices.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={picked.has(m.id)}
                  onChange={(e) =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(m.id);
                      else next.delete(m.id);
                      return next;
                    })
                  }
                />
                <span className="flex-1">{m.name}</span>
                <span className="text-xs text-muted-foreground">{m.phone}</span>
              </label>
            ))}
          </div>
          <Button
            type="button"
            disabled={pending || picked.size === 0}
            onClick={() =>
              run(
                () => addMembersAction(organizationId, groupId, [...picked]),
                (r) => {
                  setNotice(
                    `Added ${r.added ?? picked.size} ${(r.added ?? picked.size) === 1 ? "person" : "people"}.`,
                  );
                  setPicked(new Set());
                },
              )
            }
          >
            Add {picked.size > 0 ? `${picked.size} selected` : "selected"}
          </Button>

          {teamChoices.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="font-medium">Add a team login</p>
              <p className="text-xs text-muted-foreground">
                So they can chat from the team app. Team logins are group
                admins.
              </p>
              <div className="flex flex-wrap gap-2">
                {teamChoices.map((t) => (
                  <Button
                    key={t.authUserId}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        addStaffAction(organizationId, groupId, t.authUserId),
                      )
                    }
                  >
                    + {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
