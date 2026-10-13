"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";

// Where error (and other) notifications pop up. Follows the app's light/dark theme.
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} position="top-right" richColors closeButton duration={7000} />;
}
