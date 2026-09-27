"use client";

import { useState } from "react";
import { Sparkles, Users, HeartHandshake, FileText, HandCoins, CreditCard, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface TourStep {
  icon: LucideIcon;
  title: string;
  description: string;
}

// One step per nav group in DashboardShell's NAV_GROUPS, in the same
// order — a quick map of "what's where" rather than a feature-by-feature
// walkthrough, since a brand-new org has nothing in it yet for a
// DOM-anchored tour to actually point at. The DOM-anchored part comes
// right after this (see DashboardShell's SpotlightTour, chained onto
// onFinish below).
const TOUR_STEPS: TourStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to KingdomFlow",
    description: "A quick tour of where things live — six stops, then a few real buttons pointed out, and you're on your own. Replay this anytime from Help in the sidebar.",
  },
  {
    icon: Users,
    title: "People & Congregation",
    description: "Members, Leaders, Youth, Families, Branches, Attendance, and Team permissions — your whole congregation, organized and easy to reach.",
  },
  {
    icon: HeartHandshake,
    title: "Ministry Tools",
    description: "Ministries, Worship, Media, Events (with full public registration — QR passes, reminders, the works), and a shared To Do list.",
  },
  {
    icon: FileText,
    title: "Tools",
    description: "Forms and a Website Widget for capturing responses/inquiries, a private Folder for documents, Reports across your data, and Accounting.",
  },
  {
    icon: HandCoins,
    title: "Finance & Messaging",
    description: "Fund Raiser, Offering, and Donation for giving; Email, SMS, WhatsApp, and Social Media for reaching your congregation.",
  },
  {
    icon: CreditCard,
    title: "Billing & Help",
    description: "Your trial and plan live under Billing. If you get stuck, Documentation and Support are both one click away under Help.",
  },
];

// A single, controlled instance is meant to be mounted once per dashboard
// (DashboardShell renders it outside its reused `nav` JSX, which itself
// appears twice — desktop sidebar and mobile drawer — since mounting this
// twice would auto-open two overlapping dialogs for a brand-new org).
//
// onSkip and onFinish are deliberately separate rather than one shared
// "close" callback: DashboardShell treats them differently — skipping
// (at any step, or dismissing via Escape/backdrop) ends the whole
// onboarding experience immediately, while finishing normally chains
// straight into the spotlight walk of a few real sidebar buttons.
export function WelcomeTour({
  open,
  onOpenChange,
  onSkip,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkip: () => void;
  onFinish: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  function skip() {
    onOpenChange(false);
    onSkip();
  }

  function finish() {
    onOpenChange(false);
    onFinish();
  }

  // Closing any other way (Escape, clicking the backdrop) counts as
  // skipping — it should never leave the tour able to pop back up
  // unprompted on the next visit just because it wasn't dismissed via the
  // Skip button specifically.
  function handleOpenChange(next: boolean) {
    if (!next) {
      skip();
      return;
    }
    onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setStepIndex(0);
        handleOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-accent">
            <step.icon className="size-6 text-primary" />
          </div>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5">
          {TOUR_STEPS.map((_, index) => (
            <span key={index} className={`size-1.5 rounded-full ${index === stepIndex ? "bg-primary" : "bg-muted"}`} aria-hidden />
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={skip}>
            Skip
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}>
              {isLast ? "Get started" : "Next"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
