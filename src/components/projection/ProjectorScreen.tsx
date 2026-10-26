"use client";

import { useEffect, useState } from "react";
import { SlideView } from "@/components/projection/SlideView";
import type { ProjectionSlide, ProjectionTheme } from "@/types/database";

interface State {
  visible: boolean;
  mode: "full" | "lower_third";
  slide: ProjectionSlide | null;
  theme: ProjectionTheme;
}

// The page behind a church's projector link. It asks the server what is on the screen once a second and shows it, with
// nothing else on the page. In lower-third mode (or with ?bg=transparent) it has no background, so OBS can lay it over video.
export function ProjectorScreen({ token, transparent, chroma }: { token: string; transparent: boolean; chroma: boolean }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let stopped = false;
    let last = "";
    async function poll() {
      try {
        const res = await fetch(`/api/projector/${token}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as State & { updatedAt: string };
        // Only re-render when something changed.
        const stamp = `${body.updatedAt}|${body.visible}`;
        if (!stopped && stamp !== last) {
          last = stamp;
          setState({ visible: body.visible, mode: body.mode, slide: body.slide, theme: body.theme });
        }
      } catch {
        // Keep showing the last slide through a short connection drop.
      }
    }
    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [token]);

  const overVideo = transparent || state?.mode === "lower_third";
  useEffect(() => {
    // The site's own page background would show through in OBS; this page paints its own.
    const previous = document.body.style.background;
    document.body.style.background = chroma ? "#00b140" : overVideo ? "transparent" : "#000";
    document.documentElement.style.background = document.body.style.background;
    return () => {
      document.body.style.background = previous;
      document.documentElement.style.background = "";
    };
  }, [overVideo, chroma]);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: chroma ? "#00b140" : undefined }}>
      <style>{"@keyframes pv-fade{from{opacity:0;transform:translateY(0.6cqw)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){*{animation:none!important}}"}</style>
      <SlideView slide={state?.visible ? state.slide : null} mode={state?.mode ?? "full"} theme={state?.theme ?? {}} transparent={transparent || chroma} />
    </div>
  );
}
