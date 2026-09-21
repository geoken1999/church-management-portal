"use client";

import { TAB_KEYS, TAB_LABELS, type TabKey } from "@/lib/permissions/tabs";
import type { TabAccess } from "@/types/database";
import { Checkbox } from "@/components/ui/checkbox";

const LEVELS = ["read", "write", "delete"] as const;
const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = {
  read: "Read",
  write: "Write",
  delete: "Delete",
};

// Renders as hidden-input-backed checkboxes named perm_<tab>_<level> so a
// wrapping <form action={...}> picks these up in FormData with no extra
// wiring — see readTabPermissionsFromForm in organizations/actions.ts.
export function PermissionMatrix({
  value,
  onChange,
}: {
  value: Record<TabKey, TabAccess>;
  onChange: (next: Record<TabKey, TabAccess>) => void;
}) {
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
                <td className="px-3 py-2">{TAB_LABELS[tab]}</td>
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
