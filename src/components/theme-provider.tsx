"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Toggles the `.dark` class on <html> — every color in globals.css is
// already defined for both `:root` and `.dark` (this app's shadcn base
// ships both palettes), so this is the only piece that was missing.
// "system" is next-themes' own default, matching what was asked for.
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}
