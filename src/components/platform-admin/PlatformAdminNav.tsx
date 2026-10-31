"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutTemplate,
  LayoutDashboard,
  Building2,
  LifeBuoy,
  MessageSquareHeart,
  HeartPulse,
  ScrollText,
  HandCoins,
  BookOpen,
  Radio,
  ToggleLeft,
  Wallet,
  Receipt,
  BarChart3,
  Timer,
  MessageSquareText,
  Activity,
  UserX,
  Smartphone,
  Hourglass,
  Tag,
  FileText,
  ClipboardCheck,
  Boxes,
  KanbanSquare,
  UserRoundX,
  Gauge,
  BadgeCheck,
  Headset,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/platform-admin",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/platform-admin/tenants",
    label: "Tenants",
    icon: Building2,
    exact: false,
  },
  {
    href: "/platform-admin/support-team",
    label: "Support team",
    icon: Headset,
    exact: false,
  },
  {
    href: "/platform-admin/verification",
    label: "Verification",
    icon: BadgeCheck,
    exact: false,
  },
  {
    href: "/platform-admin/onboarding",
    label: "Onboarding",
    icon: ClipboardCheck,
    exact: false,
  },
  {
    href: "/platform-admin/modules",
    label: "Modules",
    icon: Boxes,
    exact: false,
  },
  {
    href: "/platform-admin/sessions",
    label: "Sessions",
    icon: Radio,
    exact: false,
  },
  {
    href: "/platform-admin/feature-flags",
    label: "Feature Flags",
    icon: ToggleLeft,
    exact: false,
  },
  {
    href: "/platform-admin/support",
    label: "Support",
    icon: LifeBuoy,
    exact: false,
  },
  {
    href: "/platform-admin/feedback",
    label: "Feedback",
    icon: MessageSquareHeart,
    exact: false,
  },
  {
    href: "/platform-admin/unenrolled-payments",
    label: "Paid, not enrolled",
    icon: UserRoundX,
    exact: false,
  },
  {
    href: "/platform-admin/design-templates",
    label: "Design templates",
    icon: LayoutTemplate,
    exact: false,
  },
  {
    href: "/platform-admin/tickets",
    label: "Tickets",
    icon: KanbanSquare,
    exact: false,
  },
  {
    href: "/platform-admin/earnings",
    label: "Earnings",
    icon: Wallet,
    exact: false,
  },
  {
    href: "/platform-admin/invoice-template",
    label: "Invoices",
    icon: FileText,
    exact: false,
  },
  {
    href: "/platform-admin/expenses",
    label: "Expenses",
    icon: Receipt,
    exact: false,
  },
  {
    href: "/platform-admin/usage",
    label: "Usage",
    icon: BarChart3,
    exact: false,
  },
  {
    href: "/platform-admin/payouts",
    label: "Payouts",
    icon: HandCoins,
    exact: false,
  },
  {
    href: "/platform-admin/cron",
    label: "Cron Jobs",
    icon: Timer,
    exact: false,
  },
  {
    href: "/platform-admin/whatsapp-templates",
    label: "WA Templates",
    icon: MessageSquareText,
    exact: false,
  },
  {
    href: "/platform-admin/whatsapp-health",
    label: "WA Health",
    icon: Activity,
    exact: false,
  },
  {
    href: "/platform-admin/retention",
    label: "Lapsed",
    icon: Hourglass,
    exact: false,
  },
  {
    href: "/platform-admin/deletion-requests",
    label: "Deletions",
    icon: UserX,
    exact: false,
  },
  {
    href: "/platform-admin/mobile-health",
    label: "App Health",
    icon: Smartphone,
    exact: false,
  },
  {
    href: "/platform-admin/versions",
    label: "Versions",
    icon: Tag,
    exact: false,
  },
  {
    href: "/platform-admin/module-health",
    label: "Module health",
    icon: Gauge,
    exact: false,
  },
  {
    href: "/platform-admin/health",
    label: "Health",
    icon: HeartPulse,
    exact: false,
  },
  {
    href: "/platform-admin/logs",
    label: "Logs",
    icon: ScrollText,
    exact: false,
  },
  { href: "/platform-admin/docs", label: "Docs", icon: BookOpen, exact: false },
];

export function PlatformAdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 overflow-x-auto py-1">
      {NAV_ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
