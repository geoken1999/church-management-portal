"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Search,
  LayoutDashboard,
  UserRound,
  Users,
  MapPin,
  Contact,
  Video,
  Music,
  CalendarDays,
  MessageSquareText,
  MessageCircle,
  Mail,
  ListTodo,
  HeartHandshake,
  Crown,
  GraduationCap,
  Target,
  HandCoins,
  Gift,
  Lock,
  CreditCard,
  BookOpen,
  LifeBuoy,
  Users2,
  FileText,
  FolderOpen,
  ClipboardCheck,
  FileBarChart,
  Calculator,
  LayoutTemplate,
  House,
} from "lucide-react";
import { InstagramIcon } from "@/components/icons/InstagramIcon";
import { YouTubeIcon } from "@/components/icons/YouTubeIcon";
import { FacebookIcon } from "@/components/icons/FacebookIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ChurchLogoUpload } from "@/components/organizations/ChurchLogoUpload";
import { OrgSwitcher } from "@/components/organizations/OrgSwitcher";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { Notification, Organization, TabAccess } from "@/types/database";
import type { OrganizationMembership } from "@/lib/organizations/dal";
import type { TabKey } from "@/lib/permissions/tabs";

const NO_TAB = null as TabKey | null;
type PlanFeature = "finance" | "socialMedia" | null;
const NO_PLAN_FEATURE = null as PlanFeature;

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/dashboard/profile", label: "Profile", icon: UserRound, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/team", label: "Team", icon: Users, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: true },
      { href: "/dashboard/branches", label: "Branches", icon: MapPin, tab: "branches" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/dashboard/members", label: "Members", icon: Contact, tab: "members" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/leaders", label: "Leaders", icon: Crown, tab: "leaders" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/youth", label: "Youth", icon: GraduationCap, tab: "youth" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/committee", label: "Committee", icon: Users2, tab: "committee" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/families", label: "Families", icon: House, tab: "families" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    label: "Ministry",
    items: [
      { href: "/dashboard/ministries", label: "Ministries", icon: HeartHandshake, tab: "ministries" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/worship", label: "Worship", icon: Music, tab: "worship" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/media", label: "Media", icon: Video, tab: "media" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/events", label: "Events", icon: CalendarDays, tab: "events" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/todos", label: "To Do", icon: ListTodo, tab: "todos" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/dashboard/forms", label: "Forms", icon: FileText, tab: "forms" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/folder", label: "Folder", icon: FolderOpen, tab: "folder" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/attendance", label: "Attendance", icon: ClipboardCheck, tab: "attendance" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/reports", label: "Reports", icon: FileBarChart, tab: "reports" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/widget", label: "Widget", icon: LayoutTemplate, tab: "widget" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/accounting", label: "Accounting", icon: Calculator, tab: "accounting" as TabKey, planFeature: "finance" as PlanFeature, managerOnly: false },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/dashboard/fundraisers", label: "Fund Raiser", icon: Target, tab: "fundraisers" as TabKey, planFeature: "finance" as PlanFeature, managerOnly: false },
      { href: "/dashboard/offerings", label: "Offering", icon: HandCoins, tab: "offerings" as TabKey, planFeature: "finance" as PlanFeature, managerOnly: false },
      { href: "/dashboard/donations", label: "Donation", icon: Gift, tab: "donations" as TabKey, planFeature: "finance" as PlanFeature, managerOnly: false },
    ],
  },
  {
    label: "Messaging",
    items: [
      { href: "/dashboard/email", label: "Email", icon: Mail, tab: "email" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/sms", label: "SMS", icon: MessageSquareText, tab: "sms" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/whatsapp", label: "WhatsApp", icon: MessageCircle, tab: "whatsapp" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    label: "Social Media",
    items: [
      { href: "/dashboard/instagram", label: "Instagram", icon: InstagramIcon, tab: "instagram" as TabKey, planFeature: "socialMedia" as PlanFeature, managerOnly: false },
      { href: "/dashboard/youtube", label: "YouTube", icon: YouTubeIcon, tab: "youtube" as TabKey, planFeature: "socialMedia" as PlanFeature, managerOnly: false },
      { href: "/dashboard/facebook", label: "Facebook", icon: FacebookIcon, tab: "facebook" as TabKey, planFeature: "socialMedia" as PlanFeature, managerOnly: false },
    ],
  },
  {
    label: "Help",
    items: [
      { href: "/dashboard/docs", label: "Documentation", icon: BookOpen, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/support", label: "Support", icon: LifeBuoy, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
];

export function DashboardShell({
  organization,
  canManage,
  memberships,
  notifications,
  tabAccess,
  planFeatures,
  trialDaysRemaining,
  children,
}: {
  organization: Organization;
  canManage: boolean;
  memberships: OrganizationMembership[];
  notifications: Notification[];
  tabAccess: Record<TabKey, TabAccess>;
  planFeatures: { finance: boolean; socialMedia: boolean };
  trialDaysRemaining: number | null;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const pathname = usePathname();

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.managerOnly && !canManage) return false;
      return !item.tab || tabAccess[item.tab]?.read;
    }),
  })).filter((group) => group.items.length > 0);

  const query = navSearch.trim().toLowerCase();
  const filteredGroups = query
    ? visibleGroups
        .map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(query)) }))
        .filter((group) => group.items.length > 0)
    : visibleGroups;

  const nav = (
    <nav className="flex flex-col gap-4 p-3">
      <div className="relative px-0.5">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search tabs..."
          className="h-8 pl-8"
          value={navSearch}
          onChange={(event) => setNavSearch(event.target.value)}
          aria-label="Search tabs"
        />
      </div>
      {filteredGroups.length === 0 && (
        <p className="px-3 text-sm text-muted-foreground">No tabs match &quot;{navSearch.trim()}&quot;.</p>
      )}
      {filteredGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</p>
          {group.items.map((item) => {
            const active = pathname === item.href;
            // A plan-gated item still links through to its page — that's
            // where the actual "upgrade to unlock" content lives — this
            // just signals it's locked rather than hiding it outright.
            const locked = Boolean(item.planFeature && !planFeatures[item.planFeature]);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : locked
                      ? "text-muted-foreground/60 hover:bg-accent hover:text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <item.icon className="size-4" />
                <span className="flex-1">{item.label}</span>
                {locked && <Lock className="size-3" />}
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
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-card print:hidden">
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
        <header className="border-b border-border bg-card print:hidden">
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
        {trialDaysRemaining !== null && (
          <div className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-sm text-accent-foreground print:hidden">
            <span>
              {trialDaysRemaining <= 0
                ? "Your trial ends today."
                : `${trialDaysRemaining} ${trialDaysRemaining === 1 ? "day" : "days"} left in your trial.`}
            </span>
            {canManage && (
              <Link href="/dashboard/billing" className="font-medium underline underline-offset-2">
                Subscribe now
              </Link>
            )}
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
