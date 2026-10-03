"use client";

import dynamic from "next/dynamic";

// The server has no way to know a visitor's OS theme preference, so
// ThemeToggle only ever renders meaningfully client-side — skipping SSR
// for it outright avoids a hydration mismatch, the same pattern already
// used for EventsManagerClient/InstagramManagerClient elsewhere in this
// app, rather than a "mounted" state flag (which the set-state-in-effect
// lint rule here disallows anyway).
export const ThemeToggle = dynamic(() => import("@/components/ThemeToggle").then((mod) => mod.ThemeToggle), { ssr: false });
