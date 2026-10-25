"use client";

import { useState } from "react";
import { Check, Link2, MessageCircle, Phone, Mail, Star, HandHeart, Undo2 } from "lucide-react";
import { markVisitorFollowedUp } from "@/lib/visitors/actions";
import { filterVisitors, type VisitorFilter } from "@/lib/visitors/rules";
import type { VisitorRow } from "@/lib/visitors/dal";
import { QrCodeDialog } from "@/components/members/QrCodeDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FILTERS: { key: VisitorFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "followup", label: "Asked for a follow-up" },
  { key: "awaiting", label: "Waiting for feedback" },
];

function day(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export function VisitorsManager({ visitors, orgName, link, canWrite }: { visitors: VisitorRow[]; orgName: string; link: string; canWrite: boolean }) {
  const [filter, setFilter] = useState<VisitorFilter>("all");
  const [copied, setCopied] = useState(false);
  const shown = filterVisitors(visitors, filter);
  const waiting = filterVisitors(visitors, "followup").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Link2 className="size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Visitor QR code</p>
              <p className="truncate text-xs text-muted-foreground">{link}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <QrCodeDialog link={link} title={`${orgName} visitors`} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} type="button" size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
            {f.label}
            {f.key === "followup" && waiting > 0 ? <span className="ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 text-xs">{waiting}</span> : null}
          </Button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">{visitors.length} visitor{visitors.length === 1 ? "" : "s"}</span>
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {visitors.length === 0
              ? "No visitors yet. Put the QR code on a screen or card at the door; guests add themselves."
              : "Nobody matches this filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((v) => (
            <Card key={v.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-heading text-base font-bold">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      First visit {day(v.first_visited_on)}
                      {v.visit_count > 1 ? ` · ${v.visit_count} visits, latest ${day(v.last_visited_on)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {v.wants_followup === true && (v.followed_up_at ? <Badge variant="secondary">Followed up</Badge> : <Badge>Asked for a follow-up</Badge>)}
                    {v.pass?.state === "entered" && <Badge variant="secondary">Entered</Badge>}
                    {v.pass?.state === "valid" && <Badge variant="outline">Pass {v.pass.code}</Badge>}
                    {v.wants_followup === false && <Badge variant="outline">No follow-up wanted</Badge>}
                    {!v.feedback_at && <Badge variant="outline">{v.feedback_sent_at ? "Feedback requested" : "Feedback not sent yet"}</Badge>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <a className="inline-flex items-center gap-1.5 hover:underline" href={`tel:${v.phone}`}>
                    <Phone className="size-3.5 text-muted-foreground" />
                    {v.phone}
                  </a>
                  <a className="inline-flex items-center gap-1.5 hover:underline" href={whatsappLink(v.phone)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-3.5 text-muted-foreground" />
                    WhatsApp
                  </a>
                  {v.email && (
                    <a className="inline-flex items-center gap-1.5 hover:underline" href={`mailto:${v.email}`}>
                      <Mail className="size-3.5 text-muted-foreground" />
                      {v.email}
                    </a>
                  )}
                </div>

                {v.prayer_request && (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <HandHeart className="size-3.5" /> Prayer request
                    </p>
                    {v.prayer_request}
                  </div>
                )}

                {v.feedback_at ? (
                  <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center gap-0.5" aria-label={`Rated ${v.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={`size-4 ${n <= (v.rating ?? 0) ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                    {v.feedback_text ? <p>{v.feedback_text}</p> : <p className="text-muted-foreground">No comments.</p>}
                  </div>
                ) : v.feedback_note && !v.feedback_sent_at ? (
                  <p className="text-xs text-muted-foreground">Feedback message not sent yet: {v.feedback_note}</p>
                ) : null}

                {canWrite && v.wants_followup === true && (
                  <form action={markVisitorFollowedUp}>
                    <input type="hidden" name="id" value={v.id} />
                    {v.followed_up_at ? <input type="hidden" name="undo" value="1" /> : null}
                    <Button type="submit" size="sm" variant={v.followed_up_at ? "ghost" : "outline"}>
                      {v.followed_up_at ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
                      {v.followed_up_at ? "Undo followed up" : "Mark as followed up"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
