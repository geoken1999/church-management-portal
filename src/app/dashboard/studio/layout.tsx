import type { ReactNode } from "react";
import { googleFontsUrl } from "@/lib/designer/model";

// The designer's Google fonts. React moves this stylesheet into the page head and loads it once.
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href={googleFontsUrl()} precedence="default" />
      {children}
    </>
  );
}
