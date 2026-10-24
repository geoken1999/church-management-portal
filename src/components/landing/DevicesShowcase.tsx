import type { ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Contact,
  FolderOpen,
  HandCoins,
  Heart,
  Home,
  LayoutDashboard,
  Play,
  Radio,
  Search,
  Users,
  Video,
} from "lucide-react";

// Illustrative, hand-built mockups of KingdomFlow on a computer, an iPad and a phone: not real screenshots and
// not any real church's data. Built from div/Tailwind (like DashboardPreview and MobileAppPreview) so they stay
// sharp at any size, follow the site's colours and cost nothing to load.

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Contact, label: "Members" },
  { icon: ClipboardCheck, label: "Attendance" },
  { icon: CalendarDays, label: "Events" },
  { icon: HandCoins, label: "Offering" },
  { icon: FolderOpen, label: "Folder" },
];

const BARS = [38, 52, 44, 66, 58, 78, 70, 92];

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-full bg-muted ${className}`} />;
}

/** The team's web dashboard, in a laptop. */
function Desktop() {
  return (
    <div className="w-full min-w-0">
      <div className="overflow-hidden rounded-t-xl border border-border bg-card shadow-2xl shadow-primary/10 ring-1 ring-black/5">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2">
          <span className="size-2 rounded-full bg-destructive/40" />
          <span className="size-2 rounded-full bg-primary/30" />
          <span className="size-2 rounded-full bg-secondary-foreground/20" />
          <div className="mx-auto h-4 w-1/3 rounded-full bg-background/80" />
        </div>
        <div className="flex">
          <div className="hidden w-28 shrink-0 border-r border-border bg-muted/30 p-2 sm:block lg:w-36">
            <div className="mb-3 flex items-center gap-1.5 px-1">
              <div className="size-4 rounded bg-primary" />
              <span className="text-[10px] font-semibold">KingdomFlow</span>
            </div>
            <div className="space-y-0.5">
              {NAV.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[9px] lg:text-[10px] ${
                    item.active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="size-3" />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3 overflow-hidden p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold lg:text-xs">Good morning</p>
                <p className="text-[9px] text-muted-foreground">Here&apos;s your church this week</p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Search className="size-3" />
                <Bell className="size-3" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Members", "1,248"],
                ["Branches", "4"],
                ["This week's giving", "₹86,400"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg border border-border bg-background p-2">
                  <p className="truncate text-[8px] text-muted-foreground lg:text-[9px]">{label}</p>
                  <p className="font-heading text-xs font-bold lg:text-sm">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-3 min-w-0 rounded-lg border border-border bg-background p-2">
                <p className="mb-1.5 text-[9px] font-medium">Attendance</p>
                <div className="flex h-16 items-end gap-1.5 lg:h-20">
                  {BARS.map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-primary/80" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
              <div className="col-span-2 min-w-0 space-y-1.5 rounded-lg border border-border bg-background p-2">
                <p className="text-[9px] font-medium">Upcoming</p>
                {["Sunday service", "Youth night", "Prayer meeting"].map((e) => (
                  <div key={e} className="flex items-center gap-1.5">
                    <CalendarDays className="size-3 text-primary" />
                    <span className="text-[8px] lg:text-[9px]">{e}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto h-2 w-[104%] -translate-x-[2%] rounded-b-xl bg-foreground/80" />
    </div>
  );
}

/** What a member sees on their home screen: shared by the iPad and the phone. */
function MemberHome({ wide, notch }: { wide?: boolean; notch?: boolean }) {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className={`flex items-center justify-between border-b border-border px-3 pb-2 ${notch ? "pt-5" : "pt-2"}`}>
        <div className="flex items-center gap-1.5">
          <div className="size-4 rounded-full bg-primary" />
          <span className="text-[10px] font-semibold">Grace Church</span>
        </div>
        <Bell className="size-3 text-muted-foreground" />
      </div>
      <div className="flex-1 space-y-2.5 overflow-hidden p-3">
        <div className="rounded-xl bg-primary p-3 text-primary-foreground">
          <p className="text-[9px] opacity-80">Welcome back</p>
          <p className="font-heading text-xs font-bold">Join us this Sunday, 9:30 AM</p>
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[8px]">
            <Radio className="size-2.5" /> Live stream
          </div>
        </div>
        <div className={`grid gap-2 ${wide ? "grid-cols-4" : "grid-cols-4"}`}>
          {[
            [CalendarDays, "Events"],
            [Heart, "Give"],
            [Users, "Groups"],
            [Video, "Live"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Heart;
            return (
              <div key={label as string} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card py-1.5">
                <I className="size-3.5 text-primary" />
                <span className="text-[8px]">{label as string}</span>
              </div>
            );
          })}
        </div>
        <div className={`grid gap-2 ${wide ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="space-y-1.5 rounded-lg border border-border bg-card p-2">
            <p className="text-[9px] font-medium">Upcoming events</p>
            {["Sunday service", "Youth night"].map((e, i) => (
              <div key={e} className="flex items-center gap-2">
                <div className="flex size-6 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 text-[7px] font-bold text-primary">
                  <span>{i === 0 ? "26" : "30"}</span>
                  <span>OCT</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[8px] font-medium">{e}</p>
                  <Bar className="mt-0.5 h-1 w-14" />
                </div>
              </div>
            ))}
          </div>
          {wide ? (
            <div className="space-y-1.5 rounded-lg border border-border bg-card p-2">
              <p className="text-[9px] font-medium">Latest sermon</p>
              <div className="relative flex h-14 items-center justify-center rounded-md bg-gradient-to-br from-primary/80 to-primary/30">
                <Play className="size-5 fill-primary-foreground text-primary-foreground" />
              </div>
              <Bar className="h-1 w-20" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-around border-t border-border bg-card py-1.5 text-muted-foreground">
        {[
          [Home, "Home", true],
          [CalendarDays, "Events", false],
          [Heart, "Prayer", false],
          [Users, "Church", false],
        ].map(([Icon, label, active]) => {
          const I = Icon as typeof Home;
          return (
            <div key={label as string} className={`flex flex-col items-center gap-0.5 ${active ? "text-primary" : ""}`}>
              <I className="size-3" />
              <span className="text-[7px]">{label as string}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tablet() {
  return (
    <div className="w-full min-w-0 rounded-[1.4rem] border-[7px] border-foreground/90 bg-background shadow-2xl shadow-primary/10">
      <div className="aspect-[10/9] overflow-hidden rounded-[0.9rem] lg:aspect-[5/6]">
        <MemberHome wide />
      </div>
    </div>
  );
}

function Phone() {
  return (
    <div className="relative w-full rounded-[1.6rem] border-[6px] border-foreground/90 bg-background shadow-2xl shadow-primary/10">
      <div className="absolute left-1/2 top-1 z-10 h-2.5 w-10 -translate-x-1/2 rounded-full bg-foreground/90" aria-hidden />
      <div className="aspect-[9/17] overflow-hidden rounded-[1.1rem]">
        <MemberHome notch />
      </div>
    </div>
  );
}

function Device({ label, note, className, children }: { label: string; note: string; className: string; children: ReactNode }) {
  return (
    <figure className={`min-w-0 ${className}`}>
      {children}
      <figcaption className="mt-4 text-center">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </figcaption>
    </figure>
  );
}

export function DevicesShowcase() {
  return (
    <div className="relative mt-12">
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,var(--color-primary),transparent)] opacity-15 blur-2xl"
        aria-hidden
      />
      <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-end lg:justify-center lg:gap-8">
        <Device label="Computer" note="The full dashboard for your team" className="w-full max-w-xl lg:w-[46%] lg:max-w-none">
          <Desktop />
        </Device>
        <Device label="iPad & tablets" note="Roomy layouts for the whole church" className="w-full max-w-sm lg:w-[28%] lg:max-w-none">
          <Tablet />
        </Device>
        <Device label="iPhone & Android" note="Everything in your pocket" className="w-48 sm:w-52 lg:w-[16%]">
          <Phone />
        </Device>
      </div>
    </div>
  );
}
