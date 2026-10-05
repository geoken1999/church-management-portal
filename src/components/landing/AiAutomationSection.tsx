import { Bot, Cake, MessageCircle, BellRing, Brain, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const AI_CAPABILITIES = [
  {
    icon: Bot,
    title: "Ask Aura, in plain English",
    description:
      "Ask about attendance, members, events or giving and get an answer drawn from your own church data — not a generic chatbot guessing.",
  },
  {
    icon: MessageCircle,
    title: "AI replies on Instagram and WhatsApp",
    description:
      "When AI replies are switched on, a visitor who messages your church gets an instant, on-brand answer, with a typing indicator so it feels like a real conversation.",
  },
  {
    icon: Cake,
    title: "Birthday and anniversary wishes, automatic",
    description:
      "Members get a personal wishes message on the day over WhatsApp. Your team gets a daily digest of who is celebrating, so nobody is missed.",
  },
  {
    icon: BellRing,
    title: "Reminders that run themselves",
    description:
      "Event reminders go out before each session, and to-do reminders land the morning something is due. Set once, runs on its own.",
  },
];

const AI_RULE_POINTS = [
  "You decide what Aura can read: attendance, giving, members, or nothing sensitive",
  "Automations are limited to what your plan allows, and turn off in one click",
  "Every automated send is logged, so you can see exactly what went out and when",
];

export function AiAutomationSection() {
  return (
    <section id="ai" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">
            <Brain className="size-3" />
            AI and automation
          </Badge>
          <h2 className="font-heading text-3xl font-bold tracking-tight text-balance">
            An assistant and automations that already know your church
          </h2>
          <p className="mt-3 text-muted-foreground">
            Most church software just stores your data. KingdomFlow puts it to work — answering questions, replying to visitors, and
            looking after members on the days that matter.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {AI_CAPABILITIES.map((capability) => (
              <Card key={capability.title} className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-primary/20">
                <CardContent className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                    <capability.icon className="size-5 text-primary" />
                  </div>
                  <p className="font-heading text-base font-bold">{capability.title}</p>
                  <p className="text-sm text-muted-foreground">{capability.description}</p>
                </CardContent>
              </Card>
            ))}
            <div className="sm:col-span-2">
              <ul className="space-y-3">
                {AI_RULE_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,var(--color-accent),transparent)] opacity-60 blur-2xl"
              aria-hidden
            />
            <Card size="lg" className="mx-auto max-w-md">
              <CardContent className="space-y-4">
                <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Ask Aura · example</p>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  Who was missing from youth night last Sunday?
                </div>
                <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm">
                  <p>
                    Six regulars didn&apos;t check in: Anita, David, Priya, Samuel, Ruth and Joel. Priya and Joel have missed
                    the last two weeks.
                  </p>
                  <p className="text-xs text-muted-foreground">Source: attendance, Youth, last 3 Sundays</p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
                  <Cake className="size-3.5 text-primary" />
                  Today: 4 birthday wishes sent, 1 anniversary wish scheduled for tomorrow
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
