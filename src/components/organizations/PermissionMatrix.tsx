"use client";

import { TAB_KEYS, TAB_LABELS, type TabKey } from "@/lib/permissions/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TabAccess } from "@/types/database";
import { Checkbox } from "@/components/ui/checkbox";

const LEVELS = ["read", "write", "delete"] as const;
const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = {
  read: "Read",
  write: "Write",
  delete: "Delete",
};

const PRESETS: { label: string; access: TabAccess }[] = [
  { label: "Read only", access: { read: true, write: false, delete: false } },
  { label: "Read & write", access: { read: true, write: true, delete: false } },
  { label: "Full access", access: { read: true, write: true, delete: true } },
  { label: "No access", access: { read: false, write: false, delete: false } },
];

// Renders as hidden-input-backed checkboxes named perm_<tab>_<level> so a
// wrapping <form action={...}> picks these up in FormData with no extra
// wiring — see readTabPermissionsFromForm in organizations/actions.ts.
export function PermissionMatrix({
  value,
  onChange,
  newTabs = [],
}: {
  value: Record<TabKey, TabAccess>;
  onChange: (next: Record<TabKey, TabAccess>) => void;
  /** Tabs added since this person's permissions were last saved: they are view-only until someone saves them here. */
  newTabs?: TabKey[];
}) {
  function setEvery(access: TabAccess) {
    onChange(Object.fromEntries(TAB_KEYS.map((tab) => [tab, { ...access }])) as Record<TabKey, TabAccess>);
  }

  function toggle(tab: TabKey, level: (typeof LEVELS)[number]) {
    const current = value[tab];
    const next: TabAccess = { ...current, [level]: !current[level] };
    // Write/delete without read makes no sense — editing something you
    // can't see — so granting either one also grants read.
    if (level !== "read" && next[level]) next.read = true;
    // Revoking read removes anything that depended on it.
    if (level === "read" && !next.read) {
      next.write = false;
      next.delete = false;
    }
    onChange({ ...value, [tab]: next });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Tab permissions</p>
      {newTabs.length > 0 && (
        <p className="rounded-md bg-primary/10 p-2 text-xs">
          {newTabs.length === 1 ? "1 tab was" : `${newTabs.length} tabs were`} added since this was last saved ({newTabs.map((t) => TAB_LABELS[t]).join(", ")}). Until you save here{" "}
          {newTabs.length === 1 ? "it is" : "they are"} view-only for this person.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Set every tab to:</span>
        {PRESETS.map((preset) => (
          <Button key={preset.label} type="button" size="sm" variant="outline" onClick={() => setEvery(preset.access)}>
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Tab</th>
              {LEVELS.map((level) => (
                <th key={level} className="px-3 py-2 text-center font-medium">
                  {LEVEL_LABELS[level]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TAB_KEYS.map((tab) => (
              <tr key={tab} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  {TAB_LABELS[tab]}
                  {newTabs.includes(tab) && (
                    <Badge variant="secondary" className="ml-2">
                      New
                    </Badge>
                  )}
                </td>
                {LEVELS.map((level) => (
                  <td key={level} className="px-3 py-2 text-center">
                    <Checkbox
                      name={`perm_${tab}_${level}`}
                      checked={value[tab][level]}
                      onCheckedChange={() => toggle(tab, level)}
                      aria-label={`${TAB_LABELS[tab]} ${LEVEL_LABELS[level]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
