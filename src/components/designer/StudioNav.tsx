"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Home, LayoutTemplate, Palette, Sparkles, Trash2, Upload, Users } from "lucide-react";

// Tabs that don't exist yet are shown, dimmed, so people can see what is coming without hitting a dead end.
const ITEMS = [
  { href: "/dashboard/studio", label: "Home", icon: Home, exact: true },
  { href: "/dashboard/studio/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/dashboard/studio/designs", label: "My designs", icon: FolderOpen },
  { href: "/dashboard/studio/designs?ai=1", label: "AI Design Studio", icon: Sparkles, match: "/dashboard/studio/ai" },
  { href: "/dashboard/studio/trash", label: "Trash", icon: Trash2 },
  { label: "Brand Kit", icon: Palette, soon: "Phase 2" },
  { label: "Uploads", icon: Upload, soon: "Phase 2" },
  { label: "Shared", icon: Users, soon: "Phase 4" },
] as const;

export function StudioNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Design Studio" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        if ("soon" in item) {
          return (
            <span key={item.label} title={`Coming in ${item.soon}`} className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground/60">
              <Icon className="size-4" /> {item.label}
              <span className="rounded bg-muted px-1 text-[10px] uppercase">Soon</span>
            </span>
          );
        }
        const path = item.href.split("?")[0];
        const active = "exact" in item && item.exact ? pathname === path : item.label === "AI Design Studio" ? false : pathname.startsWith(path);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Icon className="size-4" /> {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
