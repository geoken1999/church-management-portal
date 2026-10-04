"use client";

import { useState, useTransition, type ReactNode } from "react";
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
  Sparkles,
  LifeBuoy,
  Users2,
  FileText,
  FolderOpen,
  ClipboardCheck,
  FileBarChart,
  Calculator,
  LayoutTemplate,
  House,
  Compass,
  Webcam,
  Headphones,
  ShieldCheck,
  Smartphone,
  ClipboardList,
  Workflow,
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
import { WelcomeTour } from "@/components/dashboard/WelcomeTour";
import { SpotlightTour, type SpotlightStep } from "@/components/dashboard/SpotlightTour";
import { completeTour } from "@/lib/organizations/actions";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggleLoader";
import { CreditBalances, type CreditWallet } from "@/components/dashboard/CreditBalances";
import { DashboardLocaleProvider } from "@/lib/i18n/DashboardLocaleProvider";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { AppLocale } from "@/lib/i18n/config";
import type { Notification, Organization, TabAccess } from "@/types/database";
import type { OrganizationMembership } from "@/lib/organizations/dal";
import type { TabKey } from "@/lib/permissions/tabs";

const NO_TAB = null as TabKey | null;
type PlanFeature = "finance" | "socialMedia" | null;
const NO_PLAN_FEATURE = null as PlanFeature;

// `itemKey`/`groupKey` (not display text) — the actual label is looked up
// from the current locale's dictionary at render time (t.nav.groups/items),
// so this array stays locale-agnostic. Keys match src/lib/i18n/
// dictionaries/*.ts's nav.groups/nav.items exactly.
const NAV_GROUPS = [
  {
    groupKey: "overview" as const,
    items: [
      { href: "/dashboard", itemKey: "dashboard" as const, icon: LayoutDashboard, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    groupKey: "organization" as const,
    items: [
      { href: "/dashboard/profile", itemKey: "profile" as const, icon: UserRound, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/team", itemKey: "team" as const, icon: Users, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/billing", itemKey: "billing" as const, icon: CreditCard, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: true },
      { href: "/dashboard/branches", itemKey: "branches" as const, icon: MapPin, tab: "branches" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/mobile", itemKey: "mobileFeatures" as const, icon: Smartphone, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: true },
    ],
  },
  {
    groupKey: "people" as const,
    items: [
      { href: "/dashboard/members", itemKey: "members" as const, icon: Contact, tab: "members" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/leaders", itemKey: "leaders" as const, icon: Crown, tab: "leaders" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/youth", itemKey: "youth" as const, icon: GraduationCap, tab: "youth" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/committee", itemKey: "committee" as const, icon: Users2, tab: "committee" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/families", itemKey: "families" as const, icon: House, tab: "families" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    groupKey: "ministry" as const,
    items: [
      { href: "/dashboard/ministries", itemKey: "ministries" as const, icon: HeartHandshake, tab: "ministries" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/worship", itemKey: "worship" as const, icon: Music, tab: "worship" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/media", itemKey: "media" as const, icon: Video, tab: "media" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/events", itemKey: "events" as const, icon: CalendarDays, tab: "events" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/todos", itemKey: "todos" as const, icon: ListTodo, tab: "todos" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    groupKey: "tools" as const,
    items: [
      { href: "/dashboard/planner", itemKey: "planner" as const, icon: ClipboardList, tab: "planner" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/kmeet", itemKey: "kmeet" as const, icon: Webcam, tab: "kmeet" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/kaudio", itemKey: "kaudio" as const, icon: Headphones, tab: "kaudio" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/forms", itemKey: "forms" as const, icon: FileText, tab: "forms" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/folder", itemKey: "folder" as const, icon: FolderOpen, tab: "folder" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/attendance", itemKey: "attendance" as const, icon: ClipboardCheck, tab: "attendance" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/reports", itemKey: "reports" as const, icon: FileBarChart, tab: "reports" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/widget", itemKey: "widget" as const, icon: LayoutTemplate, tab: "widget" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/accounting", itemKey: "accounting" as const, icon: Calculator, tab: "accounting" as TabKey, planFeature: "finance" as PlanFeature, managerOnly: false },
    ],
  },
  {
    groupKey: "finance" as const,
    items: [
      { href: "/dashboard/fundraisers", itemKey: "fundraisers" as const, icon: Target, tab: "fundraisers" as TabKey, planFeature: "finance" as PlanFeature, managerOnly: false },
      { href: "/dashboard/offerings", itemKey: "offerings" as const, icon: HandCoins, tab: "offerings" as TabKey, planFeature: "finance" as PlanFeature, managerOnly: false },
      { href: "/dashboard/donations", itemKey: "donations" as const, icon: Gift, tab: "donations" as TabKey, planFeature: "finance" as PlanFeature, managerOnly: false },
    ],
  },
  {
    groupKey: "messaging" as const,
    items: [
      { href: "/dashboard/email", itemKey: "email" as const, icon: Mail, tab: "email" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/sms", itemKey: "sms" as const, icon: MessageSquareText, tab: "sms" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/whatsapp", itemKey: "whatsapp" as const, icon: MessageCircle, tab: "whatsapp" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    groupKey: "socialMedia" as const,
    items: [
      { href: "/dashboard/instagram", itemKey: "instagram" as const, icon: InstagramIcon, tab: "instagram" as TabKey, planFeature: "socialMedia" as PlanFeature, managerOnly: false },
      { href: "/dashboard/youtube", itemKey: "youtube" as const, icon: YouTubeIcon, tab: "youtube" as TabKey, planFeature: "socialMedia" as PlanFeature, managerOnly: false },
      { href: "/dashboard/facebook", itemKey: "facebook" as const, icon: FacebookIcon, tab: "facebook" as TabKey, planFeature: "socialMedia" as PlanFeature, managerOnly: false },
    ],
  },
  {
    groupKey: "aiTools" as const,
    items: [
      { href: "/dashboard/ask-aura", itemKey: "askAura" as const, icon: Sparkles, tab: "aitools" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/ai-rules", itemKey: "aiRules" as const, icon: ShieldCheck, tab: "airules" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/automation", itemKey: "automations" as const, icon: Workflow, tab: "automations" as TabKey, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
  {
    groupKey: "help" as const,
    items: [
      { href: "/dashboard/docs", itemKey: "documentation" as const, icon: BookOpen, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
      { href: "/dashboard/support", itemKey: "support" as const, icon: LifeBuoy, tab: NO_TAB, planFeature: NO_PLAN_FEATURE, managerOnly: false },
    ],
  },
];

// Chained onto the end of WelcomeTour (see handleTourFinish below) — a
// handful of real sidebar buttons, not all ~28 modules, since more stops
// than this stops being a "quick tour" and starts being a chore. A step
// whose target isn't in the DOM (this login lacks read access to that tab,
// e.g. Billing for a non-manager) is skipped automatically by
// SpotlightTour itself.
const SPOTLIGHT_STEPS: SpotlightStep[] = [
  { target: "/dashboard/members", title: "Members", description: "Your congregation roster — add people one at a time or bulk-import from Excel." },
  { target: "/dashboard/events", title: "Events", description: "One-off or recurring events, with an optional public registration page and QR check-in passes." },
  { target: "/dashboard/attendance", title: "Attendance", description: "Take attendance by branch, or check in registrants from a linked event." },
  { target: "/dashboard/email", title: "Messaging", description: "Email, SMS, and WhatsApp campaigns all live in this section of the sidebar." },
  { target: "/dashboard/reports", title: "Reports", description: "Filter and export (or email) data across Members, Attendance, Events, Offerings, and Donations." },
  { target: "/dashboard/billing", title: "Billing", description: "Check your trial status, manage your plan, and see what each tier includes." },
];

// A thin wrapper so the locale context exists before DashboardShellInner
// (below) renders — that inner component both provides the "Take the
// tour"/nav labels via useLocale() and needs to already be inside the
// provider it can't itself create, since a component can't consume a
// context it's also the one wrapping its own return in.
export function DashboardShell(
  props: {
    organization: Organization;
    canManage: boolean;
    memberships: OrganizationMembership[];
    notifications: Notification[];
    tabAccess: Record<TabKey, TabAccess>;
    planFeatures: { finance: boolean; socialMedia: boolean };
    creditBalances: { sms: CreditWallet; ai: CreditWallet; email: CreditWallet };
    trialDaysRemaining: number | null;
    initialLocale: AppLocale;
    children: ReactNode;
  },
) {
  const { initialLocale, ...rest } = props;
  return (
    <DashboardLocaleProvider initialLocale={initialLocale}>
      <DashboardShellInner {...rest} />
    </DashboardLocaleProvider>
  );
}

function DashboardShellInner({
  organization,
  canManage,
  memberships,
  notifications,
  tabAccess,
  planFeatures,
  creditBalances,
  trialDaysRemaining,
  children,
}: {
  organization: Organization;
  canManage: boolean;
  memberships: OrganizationMembership[];
  notifications: Notification[];
  tabAccess: Record<TabKey, TabAccess>;
  planFeatures: { finance: boolean; socialMedia: boolean };
  creditBalances: { sms: CreditWallet; ai: CreditWallet; email: CreditWallet };
  trialDaysRemaining: number | null;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Lazily seeded from the org's own completion state rather than always
  // false, so a brand-new organization's first dashboard visit auto-opens
  // it — see WelcomeTour's own doc comment for why this is mounted once
  // here rather than inside `nav`, which is itself rendered twice.
  const [tourOpen, setTourOpen] = useState(organization.tour_completed_at === null);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [, startTourTransition] = useTransition();
  const [navSearch, setNavSearch] = useState("");
  const pathname = usePathname();

  function markTourDone() {
    startTourTransition(() => {
      completeTour(organization.id);
    });
  }

  // Skipping the modal (at any step, or dismissing it via Escape/backdrop)
  // ends the whole onboarding experience right away — it shouldn't feel
  // like skipping one popup just opens another. Finishing it normally
  // chains into the spotlight walk, but only on a wide-enough viewport to
  // actually show the sidebar it points at (see SpotlightTour's own doc
  // comment) — on mobile this just marks the tour done directly.
  function handleTourSkip() {
    markTourDone();
  }

  function handleTourFinish() {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSpotlightOpen(true);
    } else {
      markTourDone();
    }
  }

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
        .map((group) => ({ ...group, items: group.items.filter((item) => t.nav.items[item.itemKey].toLowerCase().includes(query)) }))
        .filter((group) => group.items.length > 0)
    : visibleGroups;

  const nav = (
    <nav className="flex flex-col gap-4 p-3">
      <div className="relative px-0.5">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t.nav.searchPlaceholder}
          className="h-8 pl-8"
          value={navSearch}
          onChange={(event) => setNavSearch(event.target.value)}
          aria-label={t.nav.searchPlaceholder}
        />
      </div>
      {filteredGroups.length === 0 && <p className="px-3 text-sm text-muted-foreground">{t.nav.noTabsMatch(navSearch.trim())}</p>}
      {filteredGroups.map((group) => (
        <div key={group.groupKey} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t.nav.groups[group.groupKey]}</p>
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
                data-tour-target={item.href}
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
                <span className="flex-1">{t.nav.items[item.itemKey]}</span>
                {locked && <Lock className="size-3" />}
              </Link>
            );
          })}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setTourOpen(true)}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Compass className="size-4" />
        <span className="flex-1">{t.nav.takeTheTour}</span>
      </button>
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
    <div className="min-h-screen bg-background lg:flex lg:h-screen lg:overflow-hidden">
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-border lg:bg-card scrollbar-hide print:hidden">
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

      <div className="flex min-h-screen flex-1 flex-col lg:h-screen lg:min-h-0 lg:overflow-hidden">
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
              <CreditBalances sms={creditBalances.sms} ai={creditBalances.ai} email={creditBalances.email} />
              <ThemeToggle />
              <LanguageSwitcher />
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
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:overflow-y-auto scrollbar-hide print:max-w-none print:p-0">
          {children}
        </main>
      </div>

      <WelcomeTour open={tourOpen} onOpenChange={setTourOpen} onSkip={handleTourSkip} onFinish={handleTourFinish} />
      <SpotlightTour
        steps={SPOTLIGHT_STEPS}
        open={spotlightOpen}
        onDone={() => {
          setSpotlightOpen(false);
          markTourDone();
        }}
      />
    </div>
  );
}
