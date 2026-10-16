import type { ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  Heart,
  Home,
  LayoutGrid,
  MessageCircle,
  QrCode,
  Radio,
  Sparkles,
  Users,
  Volume2,
  Compass,
  Send,
} from "lucide-react";

// Illustrative, hand-built mockups of the member app's screens: not real screenshots and not any
// real church's data. Built from div/Tailwind (like DashboardPreview) so they stay sharp at any
// size, follow the site's colours, and cost nothing to load.

function Phone({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure className="w-[210px] shrink-0 snap-center sm:w-[220px]">
      <div className="relative rounded-[2rem] border-[6px] border-foreground/90 bg-background shadow-xl shadow-primary/10">
        <div
          className="absolute left-1/2 top-1.5 z-10 h-3.5 w-14 -translate-x-1/2 rounded-full bg-foreground/90"
          aria-hidden
        />
        <div className="flex h-[430px] flex-col overflow-hidden rounded-[1.5rem] bg-background">
          {children}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm font-medium text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-4 pb-1 pt-2.5 text-[9px] font-medium text-muted-foreground">
      <span>9:41</span>
      <span aria-hidden>●●●</span>
    </div>
  );
}

function TabBar({ active }: { active: number }) {
  const tabs = [
    { icon: Home, label: "Home" },
    { icon: Heart, label: "Prayer" },
    { icon: LayoutGrid, label: "Space" },
    { icon: Compass, label: "Explore" },
  ];
  return (
    <div className="mt-auto grid grid-cols-4 border-t border-border bg-card px-1 py-1.5">
      {tabs.map((tab, i) => (
        <div
          key={tab.label}
          className={`flex flex-col items-center gap-0.5 text-[8px] ${i === active ? "font-semibold text-primary" : "text-muted-foreground"}`}
        >
          <tab.icon className="size-4" />
          {tab.label}
        </div>
      ))}
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-2">
        <div className="size-6 rounded-full bg-primary" />
        <span className="text-xs font-bold">{title}</span>
      </div>
      <Bell className="size-4 text-muted-foreground" />
    </div>
  );
}

function HomeScreen() {
  return (
    <>
      <StatusBar />
      <Header title="Grace Community" />
      <div className="space-y-2.5 px-3 pb-2">
        <div className="rounded-xl bg-primary p-3 text-primary-foreground">
          <p className="text-[9px] opacity-80">Good morning</p>
          <p className="text-sm font-bold">Welcome, Anna!</p>
          <p className="mt-1 text-[9px] opacity-80">
            Sunday service starts at 9:00 AM
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Radio className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold">Live now</p>
            <p className="truncate text-[9px] text-muted-foreground">
              Sunday Worship Service
            </p>
          </div>
          <span className="rounded-md bg-primary px-2 py-1 text-[9px] font-medium text-primary-foreground">
            Watch
          </span>
        </div>
        <p className="pt-1 text-[10px] font-semibold">Upcoming events</p>
        {[
          ["Youth Camp", "Sat, 24 Oct · 6:00 PM"],
          ["Prayer Night", "Fri, 30 Oct · 7:30 PM"],
        ].map(([title, when]) => (
          <div
            key={title}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5"
          >
            <CalendarDays className="size-4 text-primary" />
            <div>
              <p className="text-[10px] font-semibold">{title}</p>
              <p className="text-[9px] text-muted-foreground">{when}</p>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-accent p-2.5 text-[10px] font-semibold text-accent-foreground">
            Give online
          </div>
          <div className="rounded-xl bg-accent p-2.5 text-[10px] font-semibold text-accent-foreground">
            My ID card
          </div>
        </div>
      </div>
      <TabBar active={0} />
    </>
  );
}

function LiveScreen() {
  return (
    <>
      <div className="relative bg-foreground/90 pb-3 pt-6">
        <div className="mx-3 flex aspect-video items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary/30">
          <Volume2 className="size-6 text-primary-foreground/80" />
        </div>
        <div className="mx-3 mt-1.5 flex items-center justify-between text-[9px] text-background/80">
          <span className="rounded bg-destructive px-1.5 py-0.5 font-bold text-white">
            LIVE
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" /> 126 watching
          </span>
        </div>
      </div>
      <div className="px-3 pt-2">
        <p className="text-xs font-bold">Sunday Worship Service</p>
        <p className="text-[9px] text-muted-foreground">
          Grace Community Church
        </p>
      </div>
      <div className="mt-2 flex-1 space-y-2 overflow-hidden px-3">
        {[
          ["Pastor John", "Welcome everyone, glad you could join!", true],
          ["Maria", "Blessed Sunday to all 🙏", false],
          ["David", "Praying with you from Pune", false],
          ["Priya", "Amen!", false],
        ].map(([name, text, host]) => (
          <div key={String(name)} className="text-[10px]">
            <span className={`font-semibold ${host ? "text-primary" : ""}`}>
              {name as string}
            </span>{" "}
            <span className="text-muted-foreground">{text as string}</span>
          </div>
        ))}
      </div>
      <div className="m-2 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
        <MessageCircle className="size-3.5 text-muted-foreground" />
        <span className="flex-1 text-[9px] text-muted-foreground">
          Say something…
        </span>
        <Send className="size-3.5 text-primary" />
      </div>
    </>
  );
}

function PassScreen() {
  return (
    <>
      <StatusBar />
      <div className="px-4 py-2">
        <p className="text-xs font-bold">My event pass</p>
      </div>
      <div className="mx-3 rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
        <p className="text-[9px] font-medium uppercase tracking-wide text-primary">
          Boarding pass
        </p>
        <p className="mt-1 text-sm font-bold">Youth Camp 2026</p>
        <p className="text-[9px] text-muted-foreground">
          Sat, 24 Oct · Grace Retreat Centre
        </p>
        <div className="mx-auto mt-3 flex size-28 items-center justify-center rounded-xl bg-foreground/90 text-background">
          <QrCode className="size-20" />
        </div>
        <p className="mt-2 text-[9px] text-muted-foreground">
          Show this at the door to check in
        </p>
        <div className="mt-3 flex justify-between border-t border-dashed border-border pt-2 text-left text-[9px]">
          <div>
            <p className="text-muted-foreground">Name</p>
            <p className="font-semibold">Anna Thomas</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">Status</p>
            <p className="font-semibold text-primary">Registered</p>
          </div>
        </div>
      </div>
      <TabBar active={2} />
    </>
  );
}

function PrayerScreen() {
  return (
    <>
      <StatusBar />
      <Header title="Prayer" />
      <div className="space-y-2.5 px-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold">
            What would you like us to pray for?
          </p>
          <div className="mt-2 h-14 rounded-lg bg-muted/60" />
          <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
            <span>Share on the prayer wall</span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">
              On
            </span>
          </div>
          <div className="mt-2 rounded-lg bg-primary py-1.5 text-center text-[10px] font-medium text-primary-foreground">
            Request prayer
          </div>
        </div>
        <p className="pt-1 text-[10px] font-semibold">Prayer wall</p>
        {[
          ["Please pray for my mother's recovery.", "12 praying"],
          ["Thankful for a new job. God is good!", "8 praying"],
        ].map(([text, count]) => (
          <div
            key={text}
            className="rounded-xl border border-border bg-card p-2.5"
          >
            <p className="text-[10px]">{text}</p>
            <p className="mt-1 flex items-center gap-1 text-[9px] text-primary">
              <Sparkles className="size-3" /> {count}
            </p>
          </div>
        ))}
      </div>
      <TabBar active={1} />
    </>
  );
}

export function MobileAppPreview() {
  return (
    <div className="relative mt-12">
      <div
        className="pointer-events-none absolute inset-x-0 top-10 -z-10 mx-auto h-72 max-w-3xl bg-[radial-gradient(ellipse_60%_60%_at_50%_40%,var(--color-primary),transparent)] opacity-20 blur-3xl"
        aria-hidden
      />
      <div className="-mx-4 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 sm:mx-0 sm:justify-center sm:overflow-visible sm:px-0">
        <Phone caption="Home, designed by your church">
          <HomeScreen />
        </Phone>
        <Phone caption="Watch services live, with chat">
          <LiveScreen />
        </Phone>
        <Phone caption="Event passes with QR check-in">
          <PassScreen />
        </Phone>
        <Phone caption="Prayer requests and the prayer wall">
          <PrayerScreen />
        </Phone>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Illustration of the member app. Your church designs its own Home screen.
      </p>
    </div>
  );
}
