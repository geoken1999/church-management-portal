"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export interface SpotlightStep {
  // Matches a nav item's href, which DashboardShell also sets as
  // data-tour-target on that <Link> — hrefs are already unique and stable,
  // so there's no need for a separate id scheme.
  target: string;
  title: string;
  description: string;
}

const TOOLTIP_WIDTH = 280;
const GAP = 12;

// Highlights a real sidebar nav item at a time, dimming everything else —
// the companion to WelcomeTour's conceptual overview, chained right after
// it (see DashboardShell) to point at where a handful of the most-used
// features actually live. Desktop-only by the caller's own choice (the
// sidebar is hidden behind a drawer on narrow viewports, and asking
// someone to open it mid-tour is more friction than it's worth) — this
// component itself only handles a target that's missing from the DOM
// entirely (a step whose tab this login has no read access to, e.g.
// Billing for a non-manager), by skipping straight past it.
export function SpotlightTour({ steps, open, onDone }: { steps: SpotlightStep[]; open: boolean; onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  // Portal needs document.body, which doesn't exist during SSR — deferring
  // the flag to a (synchronous, but not directly-in-the-effect-body) call
  // avoids a hydration mismatch without React flagging it as an
  // avoidable cascading render.
  useEffect(() => {
    function markMounted() {
      setMounted(true);
    }
    markMounted();
  }, []);

  useEffect(() => {
    function resetStep() {
      if (open) setStepIndex(0);
    }
    resetStep();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function advanceOrFinish() {
      if (stepIndex + 1 < steps.length) {
        setStepIndex((i) => i + 1);
      } else {
        onDone();
      }
    }

    const step = steps[stepIndex];
    const el = document.querySelector<HTMLElement>(`[data-tour-target="${step.target}"]`);
    if (!el) {
      advanceOrFinish();
      return;
    }

    el.scrollIntoView({ block: "nearest" });
    const frame = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));

    function handleReposition() {
      setRect(el!.getBoundingClientRect());
    }
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex]);

  if (!mounted || !open || !rect) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const padding = 6;

  const box = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  // Estimated tooltip height for viewport clamping — the card's actual
  // height varies a little with description length, but this is close
  // enough to keep it from running off the bottom of the screen.
  const estimatedTooltipHeight = 190;
  const tooltipTop = Math.min(Math.max(box.top, GAP), window.innerHeight - estimatedTooltipHeight - GAP);
  const tooltipLeft = Math.min(box.left + box.width + GAP, window.innerWidth - TOOLTIP_WIDTH - GAP);

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Four dimming panels around the highlighted box, rather than one
          overlay with a cutout — avoids relying on CSS mask/clip-path
          support for what's otherwise a simple layout. */}
      <div className="fixed inset-x-0 top-0 bg-black/60" style={{ height: box.top }} onClick={onDone} />
      <div className="fixed inset-x-0 bottom-0 bg-black/60" style={{ top: box.top + box.height }} onClick={onDone} />
      <div className="fixed bg-black/60" style={{ top: box.top, height: box.height, left: 0, width: box.left }} onClick={onDone} />
      <div className="fixed bg-black/60" style={{ top: box.top, height: box.height, left: box.left + box.width, right: 0 }} onClick={onDone} />

      <div
        className="pointer-events-none fixed rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background"
        style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        aria-hidden
      />

      <div
        className="fixed rounded-xl border border-border bg-card p-4 shadow-2xl"
        style={{ top: tooltipTop, left: tooltipLeft, width: TOOLTIP_WIDTH }}
      >
        <p className="font-heading text-sm font-bold">{step.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={onDone} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Skip
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {stepIndex + 1}/{steps.length}
            </span>
            {stepIndex > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => (isLast ? onDone() : setStepIndex((i) => i + 1))}>
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
