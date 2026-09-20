"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Same reasoning as YouTubeManagerClient/InstagramManagerClient —
// EventsManager formats dates with the runtime's default locale (the
// calendar month label, event start/end times), which differs between the
// server and the browser. Skipping SSR removes the mismatch outright.
const EventsManager = dynamic(() => import("./EventsManager").then((mod) => mod.EventsManager), {
  ssr: false,
});

export function EventsManagerClient(props: ComponentProps<typeof EventsManager>) {
  return <EventsManager {...props} />;
}
