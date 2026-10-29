"use client";

import { useTransition } from "react";
import { Star } from "lucide-react";
import { setFeedbackStatus } from "@/lib/feedback/actions";
import { FEEDBACK_LABELS, type FeedbackCategory } from "@/lib/feedback/validation";
import { Button } from "@/components/ui/button";

export interface FeedbackItem {
  id: string;
  source: string;
  rating: number;
  category: FeedbackCategory;
  message: string;
  status: "new" | "reviewed" | "archived";
  userName: string | null;
  userEmail: string | null;
  role: string | null;
  church: string | null;
  screen: string | null;
  appVersion: string | null;
  device: string | null;
  createdAt: string;
}

const SOURCE: Record<string, string> = { web: "Web", android: "Android", ios: "iPhone" };

function Row({ item }: { item: FeedbackItem }) {
  const [pending, startTransition] = useTransition();
  const set = (status: FeedbackItem["status"]) => startTransition(async () => void (await setFeedbackStatus(item.id, status)));
  const meta = [item.screen, item.appVersion && `v${item.appVersion}`, item.device].filter(Boolean).join(" · ");
  return (
    <li className={`rounded-xl border bg-card p-4 ${item.status === "new" ? "border-primary/40" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex text-amber-500" aria-label={`${item.rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`size-4 ${n <= item.rating ? "fill-current" : "opacity-30"}`} />
          ))}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{FEEDBACK_LABELS[item.category]}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{SOURCE[item.source] ?? item.source}</span>
        <span className="ml-auto text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      {item.message ? <p className="mt-2 whitespace-pre-wrap text-sm">{item.message}</p> : <p className="mt-2 text-sm italic text-muted-foreground">No message, just a rating.</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {[item.userName, item.userEmail, item.role, item.church].filter(Boolean).join(" · ") || "Unknown user"}
        {meta ? ` — ${meta}` : ""}
      </p>
      <div className="mt-3 flex gap-2">
        {item.status !== "reviewed" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => set("reviewed")}>
            Mark reviewed
          </Button>
        )}
        {item.status !== "archived" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("archived")}>
            Archive
          </Button>
        )}
        {item.status !== "new" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("new")}>
            Mark new
          </Button>
        )}
      </div>
    </li>
  );
}

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  if (items.length === 0) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No feedback here yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </ul>
  );
}
