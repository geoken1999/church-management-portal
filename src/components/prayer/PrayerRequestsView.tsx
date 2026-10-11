"use client";

import { useMemo, useState } from "react";
import { Search, Phone, EyeOff, Users, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";

export interface PrayerRow {
  id: string;
  request: string;
  visibility: "private" | "shared";
  isAnonymous: boolean;
  status: "open" | "answered";
  answeredAt: string | null;
  createdAt: string;
  memberName: string;
  memberPhone: string | null;
}

function formatWhen(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone });
}

function RequestCard({ row, timeZone }: { row: PrayerRow; timeZone: string }) {
  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{row.memberName}</p>
            {row.visibility === "shared" ? (
              <Badge variant="secondary">
                <Users className="size-3" /> Shared with church
              </Badge>
            ) : (
              <Badge variant="outline">
                <Lock className="size-3" /> Team only
              </Badge>
            )}
            {row.isAnonymous && (
              <Badge variant="outline">
                <EyeOff className="size-3" /> Anonymous to members
              </Badge>
            )}
            {row.status === "answered" && <Badge className="bg-emerald-600 text-white">Answered</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">{formatWhen(row.createdAt, timeZone)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm">{row.request}</p>
        {row.memberPhone && (
          <a href={`tel:${row.memberPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Phone className="size-3" />
            {row.memberPhone}
          </a>
        )}
        {row.answeredAt && <p className="text-xs text-muted-foreground">Marked answered {formatWhen(row.answeredAt, timeZone)}</p>}
      </CardContent>
    </Card>
  );
}

export function PrayerRequestsView({ rows, organizationTimezone }: { rows: PrayerRow[]; organizationTimezone: string }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.request.toLowerCase().includes(q) || row.memberName.toLowerCase().includes(q));
  }, [rows, query]);

  const open = filtered.filter((row) => row.status === "open");
  const answered = filtered.filter((row) => row.status === "answered");

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No prayer requests yet. When a member raises one in the mobile app, it shows up here and your team is notified.
        </CardContent>
      </Card>
    );
  }

  const panels = [
    { value: "open", label: "Open", items: open, empty: "No open prayer requests." },
    { value: "answered", label: "Answered", items: answered, empty: "No answered requests yet." },
    { value: "all", label: "All", items: filtered, empty: "Nothing matches your search." },
  ];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by request or member" className="pl-9" aria-label="Search prayer requests" />
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsIndicator />
          {panels.map((panel) => (
            <TabsTab key={panel.value} value={panel.value}>
              {panel.label} ({panel.items.length})
            </TabsTab>
          ))}
        </TabsList>
        {panels.map((panel) => (
          <TabsPanel key={panel.value} value={panel.value}>
            {panel.items.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">{panel.empty}</CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {panel.items.map((row) => (
                  <RequestCard key={row.id} row={row} timeZone={organizationTimezone} />
                ))}
              </div>
            )}
          </TabsPanel>
        ))}
      </Tabs>
    </div>
  );
}
