"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, MapPin, CalendarDays, Users, UserPlus, Ticket } from "lucide-react";
import { toggleAttendanceRecord, updateSessionHeadcount, toggleEventRegistrationCheckIn } from "@/lib/attendance/actions";
import { validateHeadcount } from "@/lib/attendance/validation";
import type { EventRegistration } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RosterMember {
  id: string;
  first_name: string;
  last_name: string;
}

interface SessionInfo {
  id: string;
  title: string;
  occurrence_date: string;
  notes: string | null;
  headcount: number | null;
  branches: { id: string; name: string } | null;
  events: { id: string; title: string; registration_enabled: boolean } | null;
}

function registrantName(registration: EventRegistration): string {
  const name = registration.answers.name;
  return typeof name === "string" && name.trim() ? name : registration.email;
}

function RegistrantRow({
  registration,
  sessionId,
  canWrite,
  onToggled,
}: {
  registration: EventRegistration;
  sessionId: string;
  canWrite: boolean;
  onToggled: (registrationId: string, checkedIn: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const checkedIn = registration.status === "checked_in";

  function handleChange(next: boolean) {
    onToggled(registration.id, next);
    startTransition(async () => {
      const result = await toggleEventRegistrationCheckIn(sessionId, registration.id, next);
      if (result.error) {
        onToggled(registration.id, !next);
      }
    });
  }

  return (
    <label className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2 has-data-checked:border-primary/40 has-data-checked:bg-primary/5">
      <Checkbox checked={checkedIn} disabled={!canWrite || pending} onCheckedChange={(value) => handleChange(value === true)} />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block truncate">{registrantName(registration)}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">{registration.confirmation_code}</span>
      </span>
    </label>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function HeadcountEditor({ sessionId, initialHeadcount, canWrite }: { sessionId: string; initialHeadcount: number | null; canWrite: boolean }) {
  const [value, setValue] = useState(initialHeadcount != null ? String(initialHeadcount) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSessionHeadcount(sessionId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  if (!canWrite) {
    return initialHeadcount != null ? <span className="text-sm text-muted-foreground">{initialHeadcount} counted</span> : null;
  }

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="headcount" className="text-xs">
          Total headcount (optional)
        </Label>
        <Input
          id="headcount"
          type="number"
          min={0}
          className="h-8 w-28"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. 150"
        />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={pending || Boolean(validateHeadcount(value))}>
        {pending ? "Saving..." : saved ? "Saved" : "Save"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function RosterRow({
  member,
  present,
  sessionId,
  canWrite,
  onToggled,
}: {
  member: RosterMember;
  present: boolean;
  sessionId: string;
  canWrite: boolean;
  onToggled: (memberId: string, present: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    onToggled(member.id, next);
    startTransition(async () => {
      const result = await toggleAttendanceRecord(sessionId, member.id, next);
      if (result.error) {
        onToggled(member.id, !next);
      }
    });
  }

  return (
    <label className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2 has-data-checked:border-primary/40 has-data-checked:bg-primary/5">
      <Checkbox checked={present} disabled={!canWrite || pending} onCheckedChange={(value) => handleChange(value === true)} />
      <span className="text-sm">
        {member.first_name} {member.last_name}
      </span>
    </label>
  );
}

// Lets an admin check in someone the default roster didn't include — e.g.
// a member from a different branch who showed up, for a branch-scoped
// session. Searches the full org directory, excluding anyone already
// present, and marks a match present directly (no separate "add to
// roster" step — checking in IS adding them).
function AddMemberSearch({
  directory,
  presentSet,
  sessionId,
  onToggled,
}: {
  directory: RosterMember[];
  presentSet: Set<string>;
  sessionId: string;
  onToggled: (memberId: string, present: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return directory.filter((member) => !presentSet.has(member.id) && `${member.first_name} ${member.last_name}`.toLowerCase().includes(q)).slice(0, 8);
  }, [directory, presentSet, query]);

  function handleAdd(memberId: string) {
    setPendingId(memberId);
    onToggled(memberId, true);
    setQuery("");
    startTransition(async () => {
      const result = await toggleAttendanceRecord(sessionId, memberId, true);
      setPendingId(null);
      if (result.error) {
        onToggled(memberId, false);
      }
    });
  }

  return (
    <div className="relative">
      <div className="relative">
        <UserPlus className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Check in someone not listed below..."
          className="pl-8"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full space-y-0.5 rounded-lg border border-border bg-popover p-1 shadow-md">
          {matches.map((member) => (
            <button
              key={member.id}
              type="button"
              disabled={pendingId === member.id}
              onClick={() => handleAdd(member.id)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              <span>
                {member.first_name} {member.last_name}
              </span>
              <span className="text-xs text-primary">Check in</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AttendanceSessionDetail({
  session,
  roster,
  directory,
  presentMemberIds,
  eventRegistrations,
  canWrite,
}: {
  session: SessionInfo;
  roster: RosterMember[];
  directory: RosterMember[];
  presentMemberIds: string[];
  eventRegistrations: EventRegistration[];
  canWrite: boolean;
}) {
  const [search, setSearch] = useState("");
  const [presentSet, setPresentSet] = useState(() => new Set(presentMemberIds));
  const [registrations, setRegistrations] = useState(eventRegistrations);
  const [registrantSearch, setRegistrantSearch] = useState("");

  function handleRegistrantToggled(registrationId: string, checkedIn: boolean) {
    setRegistrations((current) =>
      current.map((r) => (r.id === registrationId ? { ...r, status: checkedIn ? "checked_in" : "confirmed", checked_in_at: checkedIn ? new Date().toISOString() : null } : r)),
    );
  }

  const checkedInCount = registrations.filter((r) => r.status === "checked_in").length;
  const filteredRegistrations = useMemo(() => {
    const query = registrantSearch.trim().toLowerCase();
    if (!query) return registrations;
    return registrations.filter((r) => registrantName(r).toLowerCase().includes(query) || r.email.toLowerCase().includes(query));
  }, [registrations, registrantSearch]);

  function handleToggled(memberId: string, present: boolean) {
    setPresentSet((current) => {
      const next = new Set(current);
      if (present) {
        next.add(memberId);
      } else {
        next.delete(memberId);
      }
      return next;
    });
  }

  // Anyone checked in manually via search who isn't part of the default
  // branch-scoped roster still needs to show up as a normal checklist row
  // (so they can be unchecked, and so the present count includes them).
  const displayRoster = useMemo(() => {
    const rosterIds = new Set(roster.map((member) => member.id));
    const manuallyAdded = directory.filter((member) => presentSet.has(member.id) && !rosterIds.has(member.id));
    return [...roster, ...manuallyAdded];
  }, [roster, directory, presentSet]);

  const filteredRoster = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return displayRoster;
    return displayRoster.filter((member) => `${member.first_name} ${member.last_name}`.toLowerCase().includes(query));
  }, [displayRoster, search]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-4" />
              {formatDate(session.occurrence_date)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-4" />
              {session.branches?.name ?? "All branches"}
            </span>
            <span className="flex items-center gap-1">
              <Users className="size-4" />
              {presentSet.size} of {displayRoster.length} present
            </span>
            {registrations.length > 0 && (
              <span className="flex items-center gap-1">
                <Ticket className="size-4" />
                {checkedInCount} of {registrations.length} registered attendees checked in
              </span>
            )}
            {session.events && <Badge variant="secondary">{session.events.title}</Badge>}
          </div>
          {session.notes && <p className="text-sm text-muted-foreground">{session.notes}</p>}
          <HeadcountEditor sessionId={session.id} initialHeadcount={session.headcount} canWrite={canWrite} />
        </CardContent>
      </Card>

      {!canWrite && (
        <Alert>
          <AlertDescription>You have read-only access to this tab, so check-ins are disabled.</AlertDescription>
        </Alert>
      )}

      {registrations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-primary" />
            <h2 className="font-heading text-base font-bold">Registered attendees</h2>
          </div>
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search registered attendees..."
              className="pl-8"
              value={registrantSearch}
              onChange={(event) => setRegistrantSearch(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRegistrations.map((registration) => (
              <RegistrantRow
                key={registration.id}
                registration={registration}
                sessionId={session.id}
                canWrite={canWrite}
                onToggled={handleRegistrantToggled}
              />
            ))}
          </div>
        </div>
      )}

      {canWrite && (
        <AddMemberSearch directory={directory} presentSet={presentSet} sessionId={session.id} onToggled={handleToggled} />
      )}

      {displayRoster.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No active members found for this branch. Check someone in above, or use the headcount field to record a total instead.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search this session's list..." className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRoster.map((member) => (
              <RosterRow
                key={member.id}
                member={member}
                present={presentSet.has(member.id)}
                sessionId={session.id}
                canWrite={canWrite}
                onToggled={handleToggled}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
