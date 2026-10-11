"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface MemberGroup {
  key: string;
  label: string;
  memberIds: string[];
}

// The people groups (leaders, youth, worship team, ...) available to the
// campaign pickers on the Email, SMS and WhatsApp pages. Provided once per
// page so each picker doesn't need the list threaded through its parents.
const MemberGroupsContext = createContext<MemberGroup[]>([]);

export function MemberGroupsProvider({ groups, children }: { groups: MemberGroup[]; children: ReactNode }) {
  return <MemberGroupsContext.Provider value={groups}>{children}</MemberGroupsContext.Provider>;
}

export function useMemberGroups(): MemberGroup[] {
  return useContext(MemberGroupsContext);
}

export const ALL_GROUPS = "all";

// Whether a member passes the group filter ("all" lets everyone through).
export function inGroup(memberId: string, groupKey: string, groups: MemberGroup[]): boolean {
  if (groupKey === ALL_GROUPS) return true;
  return groups.find((g) => g.key === groupKey)?.memberIds.includes(memberId) ?? false;
}

// A dropdown next to the branch filter: narrow the recipients to one group.
// Renders nothing when the church has no groups yet.
export function GroupFilterSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const groups = useMemberGroups();
  if (groups.length === 0) return null;

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? ALL_GROUPS)} disabled={disabled}>
      <SelectTrigger className="w-full sm:w-48" aria-label="Filter by group">
        <SelectValue>{() => (value === ALL_GROUPS ? "All groups" : (groups.find((g) => g.key === value)?.label ?? "All groups"))}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_GROUPS}>All groups</SelectItem>
        {groups.map((group) => (
          <SelectItem key={group.key} value={group.key}>
            {group.label} ({group.memberIds.length})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
