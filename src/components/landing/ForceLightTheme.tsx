"use client";

import { useEffect } from "react";

// The landing page is always shown in the light theme, whatever the visitor's device prefers. The dark
// palette in globals.css switches off while this class is on <html>; leaving the page (for example after
// signing in) puts it back, so the dashboard still follows the person's choice. A pop-up dialog is outside
// the page's own markup, which is why this is set on <html> rather than on the page.
export function ForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("landing-light");
    return () => root.classList.remove("landing-light");
  }, []);
  // The script runs as soon as the browser reads it, so a visitor on a dark device never sees a dark flash.
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: "document.documentElement.classList.add('landing-light')",
      }}
    />
  );
}
