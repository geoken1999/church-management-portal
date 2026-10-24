import type { PlatformEventSource } from "@/lib/platform-events/log";
import type { TabKey } from "@/lib/permissions/tabs";

// What each module of the product is measured by. A module's main table says how much is in it ("records"); an
// optional second table says how much it is being used ("activity": messages sent, registrations, enrolments).
// A module with no table of its own is listed as not tracked rather than left out.

export interface HealthSource {
  table: string;
  /** The column that says when a row was made. null: the table can only be counted. */
  dateColumn: string | null;
  /** What a row is, plural, for labels: "members", "messages". */
  noun: string;
}

export interface ModuleDef {
  key: TabKey;
  group: "People" | "Ministry" | "Tools" | "Finance" | "Messaging" | "Social" | "AI";
  records?: HealthSource;
  activity?: HealthSource;
  /** Log sources whose errors belong to this module. */
  errorSources?: PlatformEventSource[];
}

const s = (table: string, noun: string, dateColumn: string | null = "created_at"): HealthSource => ({ table, noun, dateColumn });

export const MODULES: ModuleDef[] = [
  { key: "branches", group: "People", records: s("branches", "branches") },
  { key: "members", group: "People", records: s("members", "members") },
  { key: "attendance", group: "People", records: s("attendance_sessions", "sessions"), activity: s("attendance_records", "check-ins") },
  { key: "leaders", group: "People", records: s("leaders", "leaders") },
  { key: "youth", group: "People", records: s("youths", "youth") },
  { key: "committee", group: "People", records: s("committee_members", "committee members") },
  { key: "volunteers", group: "People", records: s("volunteers", "volunteers") },
  { key: "families", group: "People", records: s("families", "families") },
  { key: "groups", group: "People", records: s("church_groups", "chat groups"), activity: s("church_group_messages", "chat messages"), errorSources: ["group_chat"] },
  { key: "visitors", group: "People", records: s("visitors", "visitors"), errorSources: ["visitor_feedback"] },
  { key: "ministries", group: "Ministry", records: s("ministries", "ministries") },
  { key: "worship", group: "Ministry", records: s("worship_team_members", "team members"), activity: s("worship_documents", "documents") },
  { key: "media", group: "Ministry", records: s("media_team_members", "team members"), activity: s("media_documents", "documents") },
  { key: "events", group: "Ministry", records: s("events", "events"), activity: s("event_registrations", "registrations"), errorSources: ["event_registration_payment"] },
  { key: "bibleschool", group: "Ministry", records: s("lms_programs", "programs"), activity: s("lms_program_enrollments", "enrolments"), errorSources: ["bible_school_payment"] },
  { key: "prayer", group: "Ministry", records: s("prayer_requests", "prayer requests") },
  { key: "todos", group: "Ministry", records: s("todos", "to-dos") },
  { key: "planner", group: "Tools", records: s("plans", "plans") },
  { key: "kmeet", group: "Tools", records: s("kmeet_meetings", "meetings") },
  { key: "kaudio", group: "Tools" },
  { key: "livestream", group: "Tools", records: s("live_streams", "streams") },
  { key: "forms", group: "Tools", records: s("forms", "forms"), activity: s("form_responses", "responses") },
  { key: "folder", group: "Tools", records: s("shared_documents", "documents") },
  { key: "reports", group: "Tools", records: s("monthly_reports", "reports") },
  { key: "widget", group: "Tools", records: s("website_widgets", "widgets"), activity: s("widget_submissions", "submissions") },
  { key: "accounting", group: "Finance", records: s("expenses", "expenses"), activity: s("invoices", "invoices") },
  { key: "fundraisers", group: "Finance", records: s("fundraisers", "fundraisers"), errorSources: ["fundraiser_giving"] },
  { key: "offerings", group: "Finance", records: s("offerings", "offerings") },
  { key: "donations", group: "Finance", records: s("donations", "donations") },
  { key: "email", group: "Messaging", records: s("email_campaigns", "campaigns"), errorSources: ["email_send"] },
  { key: "sms", group: "Messaging", records: s("sms_campaigns", "campaigns"), errorSources: ["sms_send"] },
  { key: "whatsapp", group: "Messaging", records: s("whatsapp_campaigns", "campaigns"), activity: s("whatsapp_message_log", "messages"), errorSources: ["whatsapp_send", "whatsapp_webhook", "whatsapp_template"] },
  { key: "instagram", group: "Social", records: s("instagram_connections", "connected accounts"), errorSources: ["instagram_webhook"] },
  { key: "youtube", group: "Social", records: s("youtube_connections", "connected channels") },
  { key: "facebook", group: "Social", records: s("facebook_connections", "connected pages") },
  { key: "aitools", group: "AI", records: s("aura_messages", "Aura messages"), activity: s("ai_reply_usage", "AI replies") },
  { key: "airules", group: "AI", records: s("ai_data_access_rules", "rule sets", null) },
  { key: "automations", group: "AI", records: s("automations", "automations"), activity: s("automation_runs", "runs", "started_at"), errorSources: ["automation_send"] },
];

export const MODULE_GROUPS = ["People", "Ministry", "Tools", "Finance", "Messaging", "Social", "AI"] as const;
