"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  UserRound,
  Users,
  MapPin,
  Contact,
  Video,
  Music,
  CalendarDays,
  MessageSquareText,
  Mail,
  ListTodo,
  HeartHandshake,
  Crown,
  GraduationCap,
} from "lucide-react";
import { InstagramIcon } from "@/components/icons/InstagramIcon";
import { YouTubeIcon } from "@/components/icons/YouTubeIcon";
import { FacebookIcon } from "@/components/icons/FacebookIcon";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChurchLogoUpload } from "@/components/organizations/ChurchLogoUpload";
import { OrgSwitcher } from "@/components/organizations/OrgSwitcher";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { Notification, Organization } from "@/types/database";
import type { OrganizationMembership } from "@/lib/organizations/dal";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Organization",
    items: [
      { href: "/dashboard/profile", label: "Profile", icon: UserRound },
      { href: "/dashboard/team", label: "Team", icon: Users },
      { href: "/dashboard/branches", label: "Branches", icon: MapPin },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/dashboard/members", label: "Members", icon: Contact },
      { href: "/dashboard/leaders", label: "Leaders", icon: Crown },
      { href: "/dashboard/youth", label: "Youth", icon: GraduationCap },
    ],
  },
  {
    label: "Ministry",
    items: [
      { href: "/dashboard/ministries", label: "Ministries", icon: HeartHandshake },
      { href: "/dashboard/worship", label: "Worship", icon: Music },
      { href: "/dashboard/media", label: "Media", icon: Video },
      { href: "/dashboard/events", label: "Events", icon: CalendarDays },
      { href: "/dashboard/todos", label: "To Do", icon: ListTodo },
    ],
  },
  {
    label: "Messaging",
    items: [
      { href: "/dashboard/email", label: "Email", icon: Mail },
      { href: "/dashboard/sms", label: "SMS", icon: MessageSquareText },
    ],
  },
  {
    label: "Social Media",
    items: [
      { href: "/dashboard/instagram", label: "Instagram", icon: InstagramIcon },
      { href: "/dashboard/youtube", label: "YouTube", icon: YouTubeIcon },
      { href: "/dashboard/facebook", label: "Facebook", icon: FacebookIcon },
    ],
  },
];

export function DashboardShell({
  organization,
  canManage,
  memberships,
  notifications,
  children,
}: {
  organization: Organization;
  canManage: boolean;
  memberships: OrganizationMembership[];
  notifications: Notification[];
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const nav = (
    <nav className="flex flex-col gap-4 p-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</p>
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const orgHeader = (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <ChurchLogoUpload organizationId={organization.id} logoUrl={organization.logo_url} canManage={canManage} />
      <div className="min-w-0 flex-1">
        <OrgSwitcher memberships={memberships} activeOrganizationId={organization.id} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-card">
        {orgHeader}
        <Separator />
        {nav}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-card shadow-lg">
            <div className="flex items-center justify-end px-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="size-4" />
              </Button>
            </div>
            {orgHeader}
            <Separator />
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-border bg-card">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell organizationId={organization.id} initialNotifications={notifications} />
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
