import vercelConfig from "../../../vercel.json";

// The jobs shown on the Super Admin "Cron jobs" page. Paths and schedules
// come straight from vercel.json (the source of truth for what Vercel
// actually fires); only the label and the route loader live here.
const JOB_DEFINITIONS: Record<string, { label: string; description: string; load: () => Promise<{ GET: (request: Request) => Promise<Response> }> }> = {
  "automation-run": {
    label: "Automations",
    description: "Birthday/anniversary messages, staff digest, member follow-up and membership fee requests.",
    load: () => import("@/app/api/cron/automation-run/route"),
  },
  "event-reminders": {
    label: "Event reminders",
    description: "Reminds registrants about upcoming events.",
    load: () => import("@/app/api/cron/event-reminders/route"),
  },
  "todo-reminders": {
    label: "To-do reminders",
    description: "Reminds assignees about due to-dos.",
    load: () => import("@/app/api/cron/todo-reminders/route"),
  },
  "subscription-billing": {
    label: "Subscription billing",
    description: "Renews and charges organization subscriptions.",
    load: () => import("@/app/api/cron/subscription-billing/route"),
  },
  "daily-health-report": {
    label: "Daily health report",
    description: "Emails the platform health summary.",
    load: () => import("@/app/api/cron/daily-health-report/route"),
  },
  "refresh-tokens": {
    label: "Instagram token refresh",
    description: "Refreshes connected Instagram access tokens.",
    load: () => import("@/app/api/instagram/cron/refresh-tokens/route"),
  },
};

export interface CronJob {
  key: string;
  label: string;
  description: string;
  path: string;
  schedule: string;
}

export function getCronJobs(): CronJob[] {
  return vercelConfig.crons.flatMap((cron) => {
    const key = cron.path.split("/").pop() ?? "";
    const definition = JOB_DEFINITIONS[key];
    return definition ? [{ key, label: definition.label, description: definition.description, path: cron.path, schedule: cron.schedule }] : [];
  });
}

export async function loadCronHandler(key: string) {
  const definition = JOB_DEFINITIONS[key];
  if (!definition) return null;
  return (await definition.load()).GET;
}
