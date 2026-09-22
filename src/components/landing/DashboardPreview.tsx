import { LayoutDashboard, Contact, ClipboardCheck, CalendarDays, HandCoins, FolderOpen, Bell, Search } from "lucide-react";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Contact, label: "Members" },
  { icon: ClipboardCheck, label: "Attendance" },
  { icon: CalendarDays, label: "Events" },
  { icon: HandCoins, label: "Offering" },
  { icon: FolderOpen, label: "Folder" },
];

const STATS = [
  { label: "Members", value: "1,248" },
  { label: "Branches", value: "4" },
  { label: "This week's giving", value: "₹86,400" },
];

// A purely illustrative, hand-built mockup of the product's own dashboard
// UI — not a real screenshot and not attributed to any real church's data.
// Built from div/Tailwind rather than an <img> so it stays crisp at any
// size and costs nothing to load.
export function DashboardPreview() {
  return (
    <div className="relative mx-auto max-w-4xl">
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,var(--color-primary),transparent)] opacity-20 blur-2xl"
        aria-hidden
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 ring-1 ring-black/5">
        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-3">
          <span className="size-2.5 rounded-full bg-destructive/40" />
          <span className="size-2.5 rounded-full bg-primary/30" />
          <span className="size-2.5 rounded-full bg-secondary-foreground/20" />
        </div>

        <div className="flex">
          {/* Sidebar */}
          <div className="hidden w-44 shrink-0 border-r border-border bg-muted/30 p-3 sm:block">
            <div className="mb-4 flex items-center gap-2 px-1">
              <div className="size-6 rounded-md bg-primary" />
              <span className="font-heading text-xs font-bold">KingdomFlow</span>
            </div>
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium ${
                    item.active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="h-2.5 w-24 rounded-full bg-foreground/10" />
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-muted">
                  <Search className="size-3 text-muted-foreground" />
                </div>
                <div className="flex size-6 items-center justify-center rounded-full bg-muted">
                  <Bell className="size-3 text-muted-foreground" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {STATS.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-background p-2.5 sm:p-3">
                  <p className="text-[10px] text-muted-foreground sm:text-xs">{stat.label}</p>
                  <p className="font-heading text-sm font-bold sm:text-lg">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-2 sm:mt-4">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5 sm:p-3">
                  <div className="size-7 shrink-0 rounded-full bg-accent" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2 w-1/3 rounded-full bg-foreground/10" />
                    <div className="h-2 w-1/4 rounded-full bg-foreground/5" />
                  </div>
                  <div className="h-5 w-14 shrink-0 rounded-full bg-accent" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating stat card */}
      <div className="absolute -bottom-6 -left-4 hidden rounded-xl border border-border bg-card px-4 py-3 shadow-xl sm:block">
        <p className="text-xs text-muted-foreground">Attendance today</p>
        <p className="font-heading text-lg font-bold text-primary">312 checked in</p>
      </div>
    </div>
  );
}
