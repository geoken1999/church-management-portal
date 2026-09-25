"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, LifeBuoy, HeartPulse, ScrollText, HandCoins } from "lucide-react";

const NAV_ITEMS = [
  { href: "/platform-admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/platform-admin/tenants", label: "Tenants", icon: Building2, exact: false },
  { href: "/platform-admin/support", label: "Support", icon: LifeBuoy, exact: false },
  { href: "/platform-admin/payouts", label: "Payouts", icon: HandCoins, exact: false },
  { href: "/platform-admin/health", label: "Health", icon: HeartPulse, exact: false },
  { href: "/platform-admin/logs", label: "Logs", icon: ScrollText, exact: false },
];

export function PlatformAdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 overflow-x-auto py-1">
      {NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
