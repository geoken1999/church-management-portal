import type { BilingualConfig } from "@/lib/bilingual/config";

export type ProfileStatus = "active" | "inactive";
export type OrganizationRole = "owner" | "admin" | "member";
export type InvitationRole = "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type MemberCountRange = "1-50" | "51-200" | "201-500" | "501-1000" | "1000+";

// These must be plain type-literal aliases (not `interface`) — Supabase's
// generic resolution checks `Row extends Record<string, unknown>`, which
// only holds for object type literals, not named interfaces.
export type Profile = {
  id: string;
  auth_user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  status: ProfileStatus;
  active_organization_id: string | null;
  // "en" | "ta" | "hi" for now — see src/lib/i18n/config.ts, the single
  // source of truth for which locales the app actually supports.
  locale: string;
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  logo_url: string | null;
  // Centre mark for generated QR codes (migration 0131); null = plain QRs.
  qr_logo_url: string | null;
  // Proof document for the church (migration 0225), checked by the platform admin.
  verification_status: "not_submitted" | "under_review" | "verified" | "rejected";
  verification_started_at: string | null;
  proof_document_path: string | null;
  proof_document_name: string | null;
  proof_submitted_at: string | null;
  verification_note: string | null;
  verified_at: string | null;
  // What to do when WhatsApp can't deliver, and a platform override for a
  // church whose delivery record would otherwise pause its marketing sends
  // (migration 0145).
  whatsapp_fallback: "none" | "sms" | "email";
  whatsapp_marketing_override: boolean;
  // Youth age rule, in whole years: members in this range are added to Youth
  // automatically. Both null = off (migration 0140).
  youth_age_from: number | null;
  youth_age_to: number | null;
  join_bilingual: BilingualConfig | null;
  // Logo width as a % of the QR's width, 10-30 (migration 0132).
  qr_logo_size: number;
  // Church-wide online giving (migration 0154).
  giving_enabled: boolean;
  giving_mode: FundraiserPaymentMode | null;
  giving_types: string[];
  giving_share_token: string;
  own_gateway: "razorpay" | "payu" | "cashfree";
  member_count_range: MemberCountRange | null;
  branch_count: number | null;
  // Shown on the public landing page when a platform admin turns it on (migration 0208).
  landing_listed: boolean;
  plan: string;
  // ISO 3166-1 alpha-2 (e.g. "US") — the default country code for
  // resolving members' phone numbers when their branch has none set.
  country: string | null;
  // IANA zone id (e.g. "Asia/Kolkata") — what "7 PM" means when creating
  // an event, and what every reminder/automation/email displays times
  // in. Defaults to Asia/Kolkata (see migration 0108) for every org that
  // hasn't explicitly changed it.
  timezone: string;
  // A platform admin's per-org override for a negotiated "Custom" plan
  // deal — null means "use the plain named plan (Starter/Growth/Pro)
  // unchanged." Shape owned by CustomPlanOverrides (src/lib/plans/
  // config.ts), not duplicated here, same as custom_fields above —
  // resolvePlanLimits is the only place this gets interpreted.
  custom_plan_limits: Record<string, unknown> | null;
  // Modules the church pays for on top of its plan, kept in step with organization_module_subscriptions (migration 0216).
  addon_modules: string[];
  // Basic-tier access without a subscription until this passes — see
  // getPlanAccess in src/lib/plans/dal.ts.
  trial_ends_at: string | null;
  // Add-on pack balances (see plans/config.ts ADDON_PACKS) — running
  // totals topped up by organization_addon_orders, never auto-reset.
  addon_sms_credits: number;
  addon_email_credits: number;
  addon_whatsapp_credits: number;
  addon_storage_bytes: number;
  addon_ai_credits: number;
  // K-Connect minutes bought, valid only in the month named by addon_kmeet_month (YYYY-MM).
  addon_kmeet_minutes: number;
  addon_kmeet_month: string | null;
  // null until the welcome tour (src/components/dashboard/WelcomeTour.tsx)
  // is completed or skipped — that's also what triggers it to auto-show.
  tour_completed_at: string | null;
  // Which of the dashboard's nav items (itemKey values — see NAV_GROUPS in
  // DashboardShell.tsx) an owner/admin has chosen to make available in the
  // future dedicated mobile app. Capped at 15 by a DB check constraint
  // (migration 0084) — nothing reads this yet.
  mobile_features: string[];
  created_at: string;
  updated_at: string;
};

export type AddonOrderStatus = "created" | "paid";

export type OrganizationAddonOrder = {
  id: string;
  organization_id: string;
  addon_type: "sms" | "email" | "whatsapp" | "storage" | "ai" | "kconnect";
  pack_id: string;
  credits: number;
  amount: number;
  // GST on top of amount, the total the buyer paid, and the invoice for it (migration 0181).
  gst_amount: number;
  total_amount: number | null;
  invoice_id: string | null;
  // Legacy — no live Razorpay orders were ever created. New orders use
  // payu_txnid/payu_mihpayid instead.
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  payu_txnid: string | null;
  payu_mihpayid: string | null;
  status: AddonOrderStatus;
  created_at: string;
  paid_at: string | null;
};

// Per-tab access for a "member"-role user — ignored for owner/admin, who
// always have full access regardless of what's stored here. Keyed by the
// tab keys in src/lib/permissions/tabs.ts (a loosely-typed Record since a
// stored row may predate a tab that was added later).
export type TabAccess = { read: boolean; write: boolean; delete: boolean };
export type TabPermissions = Record<string, TabAccess>;

export type OrganizationMember = {
  id: string;
  organization_id: string;
  auth_user_id: string;
  role: OrganizationRole;
  title: string | null;
  tab_permissions: TabPermissions | null;
  created_at: string;
};

export type OrganizationInvitation = {
  id: string;
  organization_id: string;
  email: string;
  role: InvitationRole;
  token: string;
  invited_by: string | null;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
};

export type SubscriptionStatus =
  | "created"
  | "authenticated"
  | "active"
  | "pending"
  | "halted"
  | "cancelled"
  | "completed"
  | "expired";

export type SubscriptionBillingInterval = "monthly" | "annual";

export type OrganizationSubscription = {
  id: string;
  organization_id: string;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  plan_id: string;
  billing_interval: SubscriptionBillingInterval;
  status: SubscriptionStatus;
  short_url: string | null;
  current_start: string | null;
  current_end: string | null;
  payu_txnid: string | null;
  // The mihpayid from the mandate-registration transaction — required by
  // PayU's Recurring Payment Transaction API (as "authpayuid") to charge
  // against this mandate.
  payu_authpayuid: string | null;
  payu_vpa: string | null;
  next_charge_at: string | null;
  predebit_notice_sent_at: string | null;
  consecutive_charge_failures: number;
  // Set when the subscription came from a tenant onboarding: the monthly price before GST, and the
  // modules it covers. Null for an ordinary plan subscription.
  monthly_amount: number | null;
  onboarding_modules: string[] | null;
  onboarding_credits: Record<string, { count: number; price: number }> | null;
  // Cancelled by the church but still running until next_charge_at, the end of the period it paid for.
  cancel_at_period_end: boolean;
  cancel_requested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionChargeStatus = "charged" | "failed";

export type SubscriptionCharge = {
  id: string;
  organization_id: string;
  subscription_id: string;
  txnid: string;
  // The total charged; gst_amount is the GST inside it.
  amount: number;
  gst_amount: number;
  invoice_id: string | null;
  status: SubscriptionChargeStatus;
  payu_response: Record<string, unknown> | null;
  charged_at: string | null;
  created_at: string;
};

export type Branch = {
  id: string;
  organization_id: string;
  name: string;
  location: string | null;
  member_count: number | null;
  // Free-text legacy fields — superseded by managed_by (a real Leader
  // reference), kept only for existing data. New branches use managed_by.
  leader_name: string | null;
  leader_phone: string | null;
  managed_by: string | null;
  // ISO 3166-1 alpha-2 (e.g. "US") — takes priority over the organization's
  // country when resolving a member's phone number for SMS.
  country: string | null;
  created_at: string;
  updated_at: string;
};

export type MemberFieldType = "text" | "number" | "date" | "checkbox" | "select";

export type MemberFieldDefinition = {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  field_type: MemberFieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// Shape returned by get_public_join_form()'s field_definitions jsonb array —
// a trimmed-down MemberFieldDefinition safe to expose to anonymous visitors.
export type PublicFieldDefinition = {
  key: string;
  label: string;
  field_type: MemberFieldType;
  options: string[] | null;
  required: boolean;
};

export type CustomFieldValue = string | number | boolean | null;
// "student" is someone outside the church who takes Bible School courses: every church feature looks at
// "active" members, so students stay out of all of it (migration 0194).
export type MemberStatus = "active" | "left" | "pending" | "student";
export type MaritalStatus = "married" | "unmarried";

export type Member = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  // Agreed to WhatsApp updates: null = never asked (allowed), false = opted
  // out (replied STOP or declined), true = agreed (migration 0145).
  whatsapp_opt_in: boolean | null;
  status: MemberStatus;
  branch_id: string | null;
  date_of_birth: string | null;
  marital_status: MaritalStatus | null;
  wedding_date: string | null;
  // Admin-set only, optional ("if they have") — never part of
  // MemberProposedChanges/PROFILE_UPDATE_FIELDS (migration 0123).
  baptism_date: string | null;
  // What the mobile app's Membership screen renders as a QR code for a
  // team member to scan and take attendance with — see migration 0124.
  membership_code: string;
  custom_fields: Record<string, CustomFieldValue>;
  created_by: string | null;
  // Set once a member completes phone-OTP login in the mobile app — see
  // /api/mobile/member-auth/complete. Unrelated to organization_members
  // (team/staff logins).
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
};

// Support-console accounts (migration 0227): can reply to tickets and view a church read-only, nothing else.
export type SupportStaff = {
  id: string;
  auth_user_id: string;
  email: string;
  name: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
};

export type MemberProfileUpdateRequestStatus = "pending" | "approved" | "rejected";

// Only the fields a member is actually allowed to propose — see
// PROFILE_UPDATE_FIELDS in src/lib/members/profile-update-requests.ts,
// the single source of truth this type intentionally mirrors.
export type MemberProposedChanges = Partial<{
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  marital_status: MaritalStatus | null;
  wedding_date: string | null;
}>;

export type MemberProfileUpdateRequest = {
  id: string;
  organization_id: string;
  member_id: string;
  proposed_changes: MemberProposedChanges;
  status: MemberProfileUpdateRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalLiveStream = {
  id: string;
  organization_id: string;
  title: string;
  platform: "youtube" | "facebook";
  url: string;
  started_at: string;
  ended_at: string | null;
  notified_at: string | null;
  last_checked_at: string | null;
  created_by: string | null;
};

export type ProjectionSlide = { kind: "bible" | "song" | "announcement" | "custom" | "presentation" | "banner"; title: string; text: string; footer: string; /** A picture to show across the whole screen (a PowerPoint slide). */ image?: string; /** A Bible passage in several translations at once; `text` holds them joined, for screens that only show text. */ versions?: { name: string; text: string }[] };
export type ProjectionTheme = { background?: string; color?: string; font?: "sans" | "serif"; /** A picture behind the lower-third bar (an address in the projection-slides storage). */ bannerImage?: string; /** How strongly the bar's colour covers the banner picture, 0-100, so the words stay readable. */ bannerShade?: number; /** "behind": the picture fills the bar behind the words; "below": it is a strip along the bottom of the bar, under them. */ bannerStyle?: "behind" | "below"; /** Keep the banner on screen (lower-third mode) even when no verse is showing. */ bannerAlways?: boolean; };
export type ProjectionScreen = {
  id: string;
  organization_id: string;
  token: string;
  visible: boolean;
  mode: "full" | "lower_third";
  slide: ProjectionSlide | null;
  theme: ProjectionTheme;
  updated_at: string;
};
export type ProjectionItem = {
  id: string;
  organization_id: string;
  kind: "song" | "announcement" | "custom" | "presentation" | "banner";
  title: string;
  body: string;
  /** A presentation's slides: the stored pictures in order, each with the text found on the slide. */
  slide_images: { path: string; text: string }[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type BibleTranslation = { id: string; organization_id: string; code: string; name: string; created_at: string };
export type BibleCustomVerse = { translation_id: string; book: number; chapter: number; verse: number; text: string };

export type VisitorPass = {
  id: string;
  organization_id: string;
  visitor_id: string;
  token: string;
  code: string;
  visit_date: string;
  valid_until: string;
  whatsapp_sent_at: string | null;
  whatsapp_note: string | null;
  entered_at: string | null;
  entered_by: string | null;
  created_at: string;
};

export type Visitor = {
  id: string;
  organization_id: string;
  name: string;
  phone: string;
  phone_key: string;
  email: string | null;
  prayer_request: string | null;
  first_visited_on: string;
  last_visited_on: string;
  visit_count: number;
  feedback_token: string;
  feedback_sent_at: string | null;
  feedback_note: string | null;
  rating: number | null;
  feedback_text: string | null;
  wants_followup: boolean | null;
  feedback_at: string | null;
  followed_up_at: string | null;
  created_at: string;
};

export type ModuleSubscriptionStatus = "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired";

export type CustomReport = {
  id: string;
  organization_id: string;
  created_by: string | null;
  name: string;
  source: string;
  columns: string[];
  filters: { branchId?: string; status?: string; method?: string };
  date_window: "all" | "last_7_days" | "last_30_days" | "this_month" | "last_month" | "this_year" | "custom";
  date_from: string | null;
  date_to: string | null;
  format: "excel" | "pdf";
  frequency: "none" | "daily" | "weekly" | "monthly";
  schedule_day: number | null;
  recipients: string[];
  last_run_at: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationModuleSubscription = {
  id: string;
  organization_id: string;
  module_key: string;
  status: ModuleSubscriptionStatus;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  monthly_amount: number;
  short_url: string | null;
  current_start: string | null;
  current_end: string | null;
  next_charge_at: string | null;
  cancel_at_period_end: boolean;
  cancel_requested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FamilyRequestStatus = "pending" | "approved" | "rejected";

export type FamilyRequestPerson = { member_id: string; relationship: string };

export type FamilyRequest = {
  id: string;
  organization_id: string;
  requested_by: string;
  name: string;
  notes: string | null;
  requester_relationship: string;
  people: FamilyRequestPerson[];
  /** "create" asks for a new family; "add" asks to put one person into target_family_id. */
  kind: "create" | "add";
  target_family_id: string | null;
  status: FamilyRequestStatus;
  family_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaTeamMember = {
  id: string;
  organization_id: string;
  member_id: string;
  role: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaEquipment = {
  id: string;
  organization_id: string;
  name: string;
  managed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaSocialAccount = {
  id: string;
  organization_id: string;
  platform: string;
  handle: string | null;
  managed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaDocument = {
  id: string;
  organization_id: string;
  title: string;
  file_path: string;
  file_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

export type Ministry = {
  id: string;
  organization_id: string;
  title: string;
  type: string | null;
  managed_by: string | null;
  vision: string | null;
  mission: string | null;
  started_on: string | null;
  future_plans: string | null;
  created_at: string;
  updated_at: string;
};

export type Leader = {
  id: string;
  organization_id: string;
  member_id: string;
  title: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CommitteeMember = {
  id: string;
  organization_id: string;
  member_id: string;
  committee_name: string;
  role: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Family = {
  id: string;
  organization_id: string;
  name: string;
  notes: string | null;
  created_by: string | null;
  owner_member_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FamilyMember = {
  id: string;
  family_id: string;
  organization_id: string;
  member_id: string;
  relationship: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FolderCategory = {
  id: string;
  organization_id: string;
  name: string;
  share_token: string;
  share_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type SharedDocument = {
  id: string;
  organization_id: string;
  category_id: string | null;
  title: string;
  file_path: string;
  file_type: string;
  file_size: number;
  share_token: string;
  share_enabled: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FormFieldType = "text" | "textarea" | "number" | "email" | "phone" | "date" | "checkbox" | "select";

export type FormField = {
  key: string;
  label: string;
  field_type: FormFieldType;
  options: string[] | null;
  required: boolean;
};

export type FormStatus = "draft" | "published" | "closed";

export type CustomForm = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  slug: string;
  fields: FormField[];
  // Two-language display config (migration 0133); null = single language.
  bilingual: BilingualConfig | null;
  status: FormStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FormResponse = {
  id: string;
  form_id: string;
  organization_id: string;
  answers: Record<string, string | number | boolean | null>;
  created_at: string;
};

export type Youth = {
  id: string;
  organization_id: string;
  member_id: string;
  grade: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  notes: string | null;
  // Added by the church's youth age rule rather than by hand (migration 0140).
  auto_added: boolean;
  created_at: string;
  updated_at: string;
};

export type InstagramConnection = {
  id: string;
  organization_id: string;
  instagram_user_id: string;
  username: string;
  account_type: string | null;
  profile_picture_url: string | null;
  media_count: number | null;
  followers_count: number | null;
  access_token: string;
  token_expires_at: string;
  connected_by: string | null;
  // The messaging-scoped id Instagram's webhook events carry for this
  // account — a different id namespace than instagram_user_id above.
  // Populated lazily (see ensureMessagingUserId in dal.ts), so null until
  // the dashboard has been loaded at least once after migration 0089.
  messaging_user_id: string | null;
  // An org can have several connected Instagram accounts at once (see
  // migration 0093, mirroring youtube_connections' own multi-channel
  // support) — the dashboard shows whichever one has is_active = true,
  // switchable without disconnecting/reconnecting. Automated behavior
  // (AI replies, comment automations) runs for every connected account
  // regardless of which is active; this only controls what the dashboard
  // displays by default.
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InstagramConversationRead = {
  id: string;
  organization_id: string;
  conversation_id: string;
  last_read_at: string;
};

export type InstagramAiMode = {
  id: string;
  organization_id: string;
  participant_id: string;
  enabled: boolean;
  // Signals "AI is composing a reply right now" across the webhook
  // (writer) and the dashboard's open conversation view (reader) — set
  // true just before generating a reply, cleared once sent or failed.
  is_typing: boolean;
  typing_started_at: string | null;
  created_at: string;
  updated_at: string;
};

// Mirrors InstagramAiMode exactly, keyed by phone_number instead of
// participant_id (WhatsApp conversations are already keyed by phone number
// everywhere else in this schema).
export type WhatsAppAiMode = {
  id: string;
  organization_id: string;
  phone_number: string;
  enabled: boolean;
  is_typing: boolean;
  typing_started_at: string | null;
  created_at: string;
  updated_at: string;
};

// Governs which categories of org data the AI features (Ask Aura's
// tool-calling, and the Instagram/WhatsApp DM auto-reply's org-context)
// are allowed to draw from — see src/lib/ai-rules/dal.ts.
export type AiDataAccessRules = {
  organization_id: string;
  // Staff-only — Ask Aura only, no Instagram/WhatsApp equivalent exists.
  allow_attendance: boolean;
  allow_members: boolean;
  allow_finance: boolean;
  // Ask Aura has its own tool for each of these five, so each keeps its
  // own flag independent of whichever public channels are also allowed
  // to use the same underlying data.
  allow_fundraisers: boolean;
  allow_events: boolean;
  allow_ministries: boolean;
  allow_branches: boolean;
  allow_forms: boolean;
  allow_fundraisers_instagram: boolean;
  allow_fundraisers_whatsapp: boolean;
  allow_events_instagram: boolean;
  allow_events_whatsapp: boolean;
  allow_ministries_instagram: boolean;
  allow_ministries_whatsapp: boolean;
  allow_branches_instagram: boolean;
  allow_branches_whatsapp: boolean;
  allow_forms_instagram: boolean;
  allow_forms_whatsapp: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type InstagramCommentAutomation = {
  id: string;
  organization_id: string;
  media_id: string | null;
  keyword: string | null;
  reply_template: string;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InstagramCommentReply = {
  id: string;
  organization_id: string;
  comment_id: string;
  automation_id: string | null;
  created_at: string;
};

// One row per AI-generated Instagram DM reply actually sent — usage for
// the plan's monthly AI credit quota is counted by querying this table for
// the current month, the same approach as sms_campaigns/email_campaigns,
// rather than a decrementing counter.
export type AiReplyUsage = {
  id: string;
  organization_id: string;
  participant_id: string | null;
  // 'instagram'/'whatsapp' (DM auto-replies) or 'ask_aura' (internal chat
  // tool) — all three draw from the same shared monthly quota/addon pool,
  // tagged here purely for observability.
  source: "instagram" | "ask_aura" | "whatsapp" | "report" | "design";
  created_at: string;
};

// One row per Ask Aura chat message (both the user's question and the
// assistant's answer) — scoped to the individual user, not the whole org,
// since each team member gets their own conversation with Aura.
export type AuraMessage = {
  id: string;
  organization_id: string;
  auth_user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type YouTubeConnection = {
  id: string;
  organization_id: string;
  channel_id: string;
  channel_title: string;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  video_count: number | null;
  view_count: number | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  is_active: boolean;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FacebookConnection = {
  id: string;
  organization_id: string;
  page_id: string;
  page_name: string;
  page_picture_url: string | null;
  fan_count: number | null;
  access_token: string;
  token_expires_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailCampaignStatus = "sent" | "partial_failure" | "failed";
export type EmailCampaignProvider = "shared" | "smtp";

export type EmailCampaign = {
  id: string;
  organization_id: string;
  subject: string;
  body_html: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  failed_recipients: { email: string; error: string }[];
  status: EmailCampaignStatus;
  provider: EmailCampaignProvider;
  sent_by: string | null;
  created_at: string;
};

export type SmsCampaignStatus = "sent" | "partial_failure" | "failed";

export type SmsCampaign = {
  id: string;
  organization_id: string;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  failed_recipients: { phone: string; error: string }[];
  status: SmsCampaignStatus;
  sent_by: string | null;
  created_at: string;
};

// 'own'/'shared' mode is a dead concept, kept only so historical rows
// (from the Twilio era) still typecheck — new campaigns no longer set it.
export type WhatsAppMode = "own" | "shared";

// Dead table (migration 0058) — stored per-org Twilio credentials for the
// old "own number" mode. Left in the DB (see migration 0097) but nothing
// reads or writes it anymore now that WhatsApp sends through the one
// shared Meta WhatsApp Cloud API number.
export type OrganizationWhatsAppAccount = {
  id: string;
  organization_id: string;
  account_sid: string;
  auth_token: string;
  whatsapp_number: string;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppTemplateCategory = "marketing" | "utility" | "authentication";
export type WhatsAppTemplateStatus = "draft" | "pending_review" | "approved" | "rejected" | "paused" | "disabled";

// A button on a WhatsApp template. Quick replies need no value at send time.
export type WhatsAppTemplateButton =
  | { type: "url"; text: string; url: string }
  | { type: "phone"; text: string; phone: string }
  | { type: "quick_reply"; text: string };

export type WhatsAppTemplate = {
  id: string;
  organization_id: string;
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  body_text: string;
  variable_count: number;
  // 'image' sends a header picture with every message from this template.
  header_type: "none" | "image";
  header_image_path: string | null;
  buttons: WhatsAppTemplateButton[];
  // Set when this is a church's copy of a KingdomFlow-provided template.
  platform_template_id: string | null;
  meta_template_id: string | null;
  status: WhatsAppTemplateStatus;
  rejected_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppCampaignStatus = "sent" | "partial_failure" | "failed";

export type WhatsAppCampaign = {
  id: string;
  organization_id: string;
  mode: WhatsAppMode | null;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  failed_recipients: { phone: string; error: string; text?: string }[];
  // People skipped because WhatsApp is limiting marketing messages to them
  // (migration 0144).
  skipped_count: number;
  skipped_recipients: { phone: string; reason: string; text?: string }[];
  // Recipients already resent by SMS/email (migration 0145).
  fallback_sent_phones: string[];
  status: WhatsAppCampaignStatus;
  sent_by: string | null;
  // The template actually sent, and the values filled into its {{n}}
  // placeholders (one shared set for the whole campaign, not personalized
  // per recipient) — null/[] for historical freeform campaigns sent
  // before this migration.
  template_id: string | null;
  template_variables: string[];
  created_at: string;
};

export type WhatsAppConversation = {
  id: string;
  organization_id: string;
  phone_number: string;
  member_id: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
};

export type WhatsAppMessageDirection = "inbound" | "outbound";

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  organization_id: string;
  direction: WhatsAppMessageDirection;
  body: string;
  // Despite the name (kept from the Twilio era rather than renaming a live
  // column), this now holds Meta's own message id ("wamid...") — matched
  // against webhook status updates the same way Twilio's SID was.
  twilio_sid: string | null;
  status: string | null;
  created_at: string;
};

export type WidgetPosition = "bottom-right" | "bottom-left";

export type WebsiteWidget = {
  id: string;
  organization_id: string;
  share_token: string;
  enabled: boolean;
  primary_color: string;
  position: WidgetPosition;
  button_label: string;
  greeting_title: string;
  greeting_message: string;
  fields: FormField[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WidgetSubmissionStatus = "new" | "read" | "archived";

export type WidgetSubmission = {
  id: string;
  widget_id: string;
  organization_id: string;
  answers: Record<string, string | number | boolean | null>;
  page_url: string | null;
  status: WidgetSubmissionStatus;
  created_at: string;
};

export type EmailSmtpSettings = {
  id: string;
  organization_id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from_email: string;
  from_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailSetupRequestStatus = "open" | "resolved";

export type EmailSetupRequest = {
  id: string;
  organization_id: string;
  requested_by: string | null;
  message: string | null;
  status: EmailSetupRequestStatus;
  created_at: string;
  resolved_at: string | null;
};

export type WorshipTeamMember = {
  id: string;
  organization_id: string;
  member_id: string;
  role: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WorshipDocument = {
  id: string;
  organization_id: string;
  title: string;
  file_path: string;
  file_type: string;
  file_size: number;
  share_token: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TodoStatus = "pending" | "completed";

export type TodoPriority = "low" | "normal" | "high";

export type Todo = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: TodoStatus;
  assigned_to: string | null;
  // Or assigned to a leader (a church member) instead of a team login (migration 0143).
  assigned_member_id: string | null;
  // The to-do event (camp, conference, ...) this to-do belongs to, if any (migration 0141).
  todo_event_id: string | null;
  // Set for automation-created follow-up tasks; null for ordinary to-dos.
  member_id: string | null;
  branch_id: string | null;
  automation_id: string | null;
  priority: TodoPriority;
  created_by: string | null;
  completed_at: string | null;
  // Set by the daily /api/cron/todo-reminders digest after it notifies an
  // assignee — dedupes so the same to-do isn't re-notified on the same day.
  last_reminder_sent_at: string | null;
  // Reminder choices (migration 0158): the day before the due date, and on it.
  remind_day_before: boolean;
  remind_due_day: boolean;
  day_before_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanStatus = "draft" | "active" | "completed";

export type PlanItem = {
  id: string;
  text: string;
  done: boolean;
  // "HH:MM", 24-hour, no date — a time-of-day slot within the plan (e.g.
  // "10:00"-"11:00" for a service's worship segment), not a full
  // timestamp. Both null for a plain, unscheduled checklist step.
  startTime: string | null;
  endTime: string | null;
  // A members.id (not profiles.auth_user_id) — a plan is assigned to a
  // Leader, a congregation role, not necessarily someone with a team
  // login. Resolved to a name client-side from the leaders list already
  // fetched for the page, not stored redundantly here.
  assignedTo: string | null;
};

export type Plan = {
  id: string;
  organization_id: string;
  title: string;
  notes: string | null;
  status: PlanStatus;
  target_date: string | null;
  items: PlanItem[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KmeetMeetingStatus = "scheduled" | "live" | "ended";

export type KmeetMode = "video" | "audio";

export type KmeetMeeting = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  event_id: string | null;
  scheduled_at: string | null;
  room_id: string | null;
  status: KmeetMeetingStatus;
  // "video" is K-Meet; "audio" is K-Audio — the same table, scheduling,
  // moderation, and room infrastructure serve both, distinguished only by
  // this column (see src/lib/kmeet/mode.ts).
  mode: KmeetMode;
  // When true, anyone without moderator permissions (any guest, and any
  // org member without kmeet write access) must be let in by a moderator
  // before they can join — otherwise everyone joins directly.
  require_admission: boolean;
  // Both set once, the moment the room is actually created (see
  // resolveMeetingRoom) — max_duration_minutes is a snapshot of the org's
  // plan limit at that moment, not re-read live.
  started_at: string | null;
  max_duration_minutes: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  // Last time anyone connected to the call reported in; a live call silent for
  // 3 minutes is ended (migration 0161, kmeet/idle.ts).
  last_active_at: string;
  // Time people spent in the room (video service), filled in by Super Admin (migration 0177).
  participant_seconds: number | null;
  usage_checked_at: string | null;
};

// A church's saved report template (migration 0168); `config` is a ReportTemplateConfig.
export type ReportTemplate = {
  id: string;
  organization_id: string;
  name: string;
  config: unknown;
  created_by: string | null;
  created_at: string;
};

// A saved monthly or annual church report (migrations 0167 and 0168); `data` is a MonthlyReportData.
export type MonthlyReport = {
  id: string;
  organization_id: string;
  kind: "monthly" | "annual";
  branch_id: string | null;
  language: "en" | "ta" | "hi";
  period: string;
  title: string;
  note: string | null;
  data: unknown;
  published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// Members who volunteer, with a volunteer ID and a digital ID card (migration 0166).
export type Volunteer = {
  id: string;
  organization_id: string;
  member_id: string;
  volunteer_no: string;
  role: string;
  team: string | null;
  joined_on: string;
  status: "active" | "inactive";
  notes: string | null;
  verify_token: string;
  // Verified by an admin who scanned the ID card (migration 0173).
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
};

// A live broadcast from a K-Connect room that members watch in the app (migration 0170).
export type LiveStreamStatus = "ready" | "live" | "ended";
export type LiveStreamOutput = { name: string; url: string; streamKey: string };
export type LiveStream = {
  id: string;
  organization_id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  status: LiveStreamStatus;
  layout: "GRID" | "SPOTLIGHT" | "SIDEBAR";
  layout_priority: "SPEAKER" | "PIN";
  orientation: "landscape" | "portrait";
  theme: "DARK" | "LIGHT" | "DEFAULT";
  quality: "low" | "med" | "high";
  audio_only: boolean;
  record: boolean;
  rtmp_outputs: LiveStreamOutput[];
  notify_members: boolean;
  chat_enabled: boolean;
  playback_url: string | null;
  // OBS / WHIP encoder sign-in (migration 0171): the private key, whether an encoder is sending now, and its session.
  ingest_key: string;
  ingest_active: boolean;
  ingest_session: string | null;
  started_at: string | null;
  ended_at: string | null;
  peak_viewers: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
// Whether a church may use the Bible School (migration 0196); the team switches it on after a request.
export type BibleSchoolAccess = LiveStreamAccess;
// Whether a church may use live streaming (migration 0172); the team switches it on after a request.
export type LiveStreamAccess = {
  organization_id: string;
  enabled: boolean;
  requested_at: string | null;
  requested_by: string | null;
  enabled_at: string | null;
  note: string | null;
  updated_at: string;
};
// A church's billing details, for invoices (migration 0181).
export type OrganizationBillingDetails = {
  organization_id: string;
  legal_name: string;
  gstin: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  email: string;
  phone: string | null;
  updated_at: string;
};

export type PlatformInvoiceKind = "subscription" | "addon";
export type PlatformInvoiceLineItem = { description: string; hsn: string; quantity: number; unitPrice: number; amount: number };
export type PlatformInvoice = {
  id: string;
  organization_id: string;
  invoice_number: string;
  kind: PlatformInvoiceKind;
  reference: string;
  issued_at: string;
  buyer: Record<string, unknown>;
  seller: Record<string, unknown>;
  template: Record<string, unknown>;
  line_items: PlatformInvoiceLineItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  gst_rate: number;
  place_of_supply: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  copy_emailed_at: string | null;
};

// A church's saved email template (migration 0180).
export type EmailTemplate = {
  id: string;
  organization_id: string;
  name: string;
  subject: string;
  body_html: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// A campaign saved to go out later (migration 0178).
// ---- Bible School (LMS), migration 0190 ----

export type LmsPublishState = "draft" | "published" | "archived";

export type LmsSettings = {
  organization_id: string;
  school_name: string;
  tagline: string | null;
  default_language: string;
  enrollment_requires_approval: boolean;
  allow_self_enrollment: boolean;
  issue_certificates: boolean;
  certificate_signer_name: string | null;
  certificate_signer_title: string | null;
  updated_at: string;
};

export type LmsProgram = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  title: string;
  description: string | null;
  objectives: string | null;
  status: LmsPublishState;
  price_amount: number | null;
  capacity: number | null;
  visibility: "organization" | "public";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsQuiz = {
  lesson_id: string;
  organization_id: string;
  course_id: string;
  pass_percent: number;
  max_attempts: number | null;
  show_answers: boolean;
  instructions: string | null;
  updated_at: string;
};

export type LmsQuizOption = { id: string; text: string; correct?: boolean };

export type LmsQuizQuestion = {
  id: string;
  lesson_id: string;
  organization_id: string;
  position: number;
  kind: "single" | "multiple" | "true_false" | "short";
  prompt: string;
  points: number;
  options: LmsQuizOption[];
  explanation: string | null;
  created_at: string;
};

export type LmsQuizAttempt = {
  id: string;
  organization_id: string;
  lesson_id: string;
  course_id: string;
  enrollment_id: string;
  member_id: string;
  attempt_number: number;
  answers: Record<string, string[] | string>;
  per_question: Record<string, { points: number | null; correct: boolean | null }>;
  auto_score: number;
  manual_score: number;
  max_score: number;
  percent: number;
  status: "submitted" | "graded";
  passed: boolean;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  submitted_at: string;
};

export type ChurchGroup = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ChurchGroupMember = {
  id: string;
  group_id: string;
  organization_id: string;
  member_id: string | null;
  auth_user_id: string | null;
  role: "member" | "admin";
  notify_mode: "all" | "mentions" | "none";
  muted_until: string | null;
  last_read_at: string;
  added_by: string | null;
  joined_at: string;
};

export type ChurchGroupMessage = {
  id: string;
  group_id: string;
  organization_id: string;
  sender_auth_user_id: string | null;
  sender_name: string;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: "image" | "file" | null;
  attachment_size: number | null;
  reply_to: string | null;
  is_announcement: boolean;
  mentions: string[];
  created_at: string;
  deleted_at: string | null;
};

export type PlatformServiceUser = {
  auth_user_id: string;
  email: string;
  display_name: string | null;
  scopes: string[];
  active: boolean;
  created_at: string;
  created_by: string | null;
};

export type LmsAssignment = {
  lesson_id: string;
  organization_id: string;
  course_id: string;
  instructions: string;
  max_points: number;
  due_at: string | null;
  allow_text: boolean;
  allow_file: boolean;
  updated_at: string;
};

export type LmsAssignmentSubmission = {
  id: string;
  organization_id: string;
  lesson_id: string;
  course_id: string;
  enrollment_id: string;
  member_id: string;
  answer_text: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  submitted_at: string;
  is_late: boolean;
  status: "submitted" | "graded";
  score: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
};

export type LmsCertificate = {
  id: string;
  organization_id: string;
  member_id: string;
  course_id: string | null;
  program_id: string | null;
  code: string;
  student_name: string;
  title: string;
  organization_name: string;
  percent: number | null;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export type ChangeTicket = {
  id: string;
  number: number;
  type: "bug" | "feature" | "improvement" | "change_request" | "security" | "task";
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "in_review" | "done" | "closed" | "wont_do";
  priority: "low" | "medium" | "high" | "urgent";
  area: string;
  reported_by: string | null;
  assignee: string | null;
  release: string | null;
  references_text: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type ChangeTicketComment = { id: string; ticket_id: string; author: string; body: string; created_at: string };

export type LmsProgramEnrollment = {
  id: string;
  organization_id: string;
  program_id: string;
  member_id: string;
  status: "pending" | "approved" | "active" | "completed" | "withdrawn" | "rejected";
  source: "admin" | "self" | "payment";
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  enrolled_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsCourse = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  code: string | null;
  title: string;
  description: string | null;
  objectives: string | null;
  cover_image_url: string | null;
  level: "beginner" | "intermediate" | "advanced";
  language: string;
  delivery_mode: "self_paced" | "instructor_led" | "blended";
  status: LmsPublishState;
  visibility: "organization" | "unlisted" | "public";
  enrollment_opens_at: string | null;
  enrollment_closes_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
  estimated_hours: number | null;
  capacity: number | null;
  price_amount: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsProgramCourse = { program_id: string; course_id: string; organization_id: string; position: number; is_required: boolean };

export type LmsCoursePrerequisite = { course_id: string; prerequisite_course_id: string; organization_id: string };

export type LmsCourseInstructor = {
  id: string;
  course_id: string;
  organization_id: string;
  member_id: string;
  auth_user_id: string | null;
  role: "lead" | "assistant";
  created_at: string;
};

export type LmsModule = {
  id: string;
  course_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  position: number;
  status: LmsPublishState;
  created_at: string;
  updated_at: string;
};

export type LmsLesson = {
  id: string;
  module_id: string;
  course_id: string;
  organization_id: string;
  title: string;
  content_type: "text" | "video" | "audio" | "document" | "resource" | "external" | "quiz" | "assignment" | "live_session";
  body: string | null;
  media_url: string | null;
  duration_minutes: number | null;
  position: number;
  is_required: boolean;
  is_free_preview: boolean;
  prerequisite_lesson_id: string | null;
  file_path: string | null;
  file_name: string | null;
  status: LmsPublishState;
  created_at: string;
  updated_at: string;
};

export type LmsEnrollment = {
  id: string;
  organization_id: string;
  course_id: string;
  member_id: string;
  status: "pending" | "approved" | "active" | "completed" | "withdrawn" | "rejected";
  source: "admin" | "self";
  note: string | null;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  withdrawn_at: string | null;
  last_lesson_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsLessonProgress = {
  id: string;
  organization_id: string;
  enrollment_id: string;
  lesson_id: string;
  member_id: string;
  completed_at: string | null;
  last_opened_at: string;
};

export type LmsStudentApplication = {
  id: string;
  organization_id: string;
  course_id: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  payment_status: "none" | "awaiting" | "paid";
  program_id: string | null;
  member_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export type LmsPaymentOrder = {
  id: string;
  organization_id: string;
  course_id: string | null;
  program_id: string | null;
  member_id: string | null;
  application_id: string | null;
  amount: number;
  status: "created" | "paid" | "failed";
  payu_txnid: string;
  payu_mihpayid: string | null;
  payer_name: string;
  payer_email: string | null;
  payer_phone: string | null;
  enrollment_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CoursePayout = { id: string; organization_id: string; amount: number; note: string | null; paid_by: string | null; created_at: string };

export type CoursePayoutRequest = {
  id: string;
  organization_id: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  payout_method: "upi" | "bank_transfer";
  upi_id: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  requested_by: string | null;
  resolved_payout_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GivingPayout = { id: string; organization_id: string; amount: number; note: string | null; paid_by: string | null; created_at: string };

export type GivingPayoutRequest = {
  id: string;
  organization_id: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  payout_method: "upi" | "bank_transfer";
  upi_id: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  requested_by: string | null;
  resolved_payout_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsLiveSession = {
  id: string;
  organization_id: string;
  course_id: string;
  meeting_id: string | null;
  title: string;
  description: string | null;
  mode: "video" | "audio";
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "cancelled";
  recording_url: string | null;
  notes: string | null;
  announced_at: string | null;
  reminder_sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LmsSessionAttendance = {
  session_id: string;
  member_id: string;
  organization_id: string;
  status: "present" | "absent" | "excused";
  source: "app" | "manual";
  first_joined_at: string | null;
  marked_by: string | null;
  updated_at: string;
};

export type LmsAuditEvent = {
  id: number;
  organization_id: string;
  actor_auth_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AppPopup = {
  id: string;
  organization_id: string;
  title: string;
  message: string;
  image_url: string | null;
  button_label: string | null;
  link_url: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  show_every_time: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduledCampaignChannel = "email" | "sms" | "whatsapp";
export type ScheduledCampaignStatus = "scheduled" | "sending" | "sent" | "failed" | "cancelled";
export type ScheduledAttachment = { path: string; filename: string; contentType: string | null; size: number };
export type ScheduledCampaign = {
  id: string;
  organization_id: string;
  channel: ScheduledCampaignChannel;
  scheduled_at: string;
  status: ScheduledCampaignStatus;
  payload: Record<string, unknown>;
  attachments: ScheduledAttachment[];
  summary: string;
  recipient_count: number;
  result: { sentCount?: number; failedCount?: number; skippedCount?: number; error?: string } | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

// A WhatsApp message the system sent on its own, for idempotency and plan usage (migration 0175).
export type WhatsAppNoticeKind = "fee_request" | "fee_reminder" | "followup_member" | "followup_leader" | "visitor_feedback" | "visitor_pass";
export type WhatsAppNotice = {
  id: string;
  organization_id: string;
  kind: WhatsAppNoticeKind;
  ref_id: string;
  recipient: string;
  status: "sent" | "failed" | "skipped";
  wamid: string | null;
  error: string | null;
  created_at: string;
};
export type LiveStreamViewer = {
  stream_id: string;
  viewer_id: string;
  last_seen: string;
  // How long they have watched, and how their playback is going (migration 0177).
  first_seen_at: string;
  watch_seconds: number;
  rtt_ms: number | null;
  buffered_ms: number | null;
  stalls: number;
  buffering: boolean;
  resolution: string | null;
};
export type LiveStreamMessage = {
  id: string;
  stream_id: string;
  organization_id: string;
  author_name: string;
  author_kind: "member" | "host";
  body: string;
  created_at: string;
};

// Churches whose access has ended and are counting down to deletion (migration 0165).
export type OrganizationRetention = {
  organization_id: string;
  expired_since: string;
  reminders_sent: number;
  last_reminder_at: string | null;
  final_warning_sent_at: string | null;
  exempt: boolean;
  blocked_reason: string | null;
  updated_at: string;
};

export type PlatformSetting = {
  key: string;
  value: unknown;
  updated_at: string;
};

export type DeletedOrganization = {
  id: string;
  organization_id: string;
  name: string;
  owner_email: string | null;
  expired_since: string | null;
  deleted_at: string;
  summary: Record<string, unknown>;
};

// The mobile app's health reporting (migration 0164).
export type MobileAppDevice = {
  device_id: string;
  platform: "android" | "ios";
  app_version: string;
  build_number: string;
  os_version: string;
  device_model: string;
  role: "team" | "member" | "guest" | null;
  auth_user_id: string | null;
  organization_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type MobileAppEvent = {
  id: string;
  device_id: string;
  kind: "session" | "error" | "crash_suspected";
  platform: string;
  app_version: string;
  os_version: string;
  device_model: string;
  screen: string;
  message: string;
  stack: string;
  fingerprint: string;
  auth_user_id: string | null;
  organization_id: string | null;
  created_at: string;
};

// A notification in a person's own inbox in the app (migration 0163).
export type MemberNotification = {
  id: string;
  auth_user_id: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  button_label: string | null;
  data: Record<string, string | number | boolean> | null;
  read_at: string | null;
  created_at: string;
};

// Someone from the mobile app waiting to be let into a call (migration 0162).
export type KmeetEntryRequest = {
  id: string;
  meeting_id: string;
  user_id: string;
  name: string;
  status: "pending" | "allowed" | "denied";
  created_at: string;
  decided_at: string | null;
};

export type DevicePlatform = "ios" | "android";

export type DevicePushToken = {
  id: string;
  auth_user_id: string;
  token: string;
  platform: DevicePlatform;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferences = {
  auth_user_id: string;
  event_new: boolean;
  todo_assigned: boolean;
  todo_due_soon: boolean;
  prayer_request: boolean;
  church_announcement: boolean;
  group_post: boolean;
  special_day: boolean;
  team_alert: boolean;
  event_update: boolean;
  updated_at: string;
};

export type EventRecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type EventMeetingMode = "offline" | "online" | "hybrid";
export type EventStatus = "pending" | "active" | "cancelled" | "completed";
export type EventReminderOffset = "24h" | "1h" | "morning_of";

// A superset of FormField, not the shared type itself — Forms and the
// Widget have no concept of per-field uniqueness, so `unique` stays
// specific to event registration rather than polluting the type every
// other field-driven feature also uses.
export type EventRegistrationField = FormField & { unique?: boolean };

export type Event = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  is_recurring: boolean;
  recurrence_frequency: EventRecurrenceFrequency | null;
  recurrence_end_date: string | null;
  branch_id: string | null;
  meeting_mode: EventMeetingMode;
  meeting_link: string | null;
  status: EventStatus;
  venue: string | null;
  map_link: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  managed_by: string | null;
  created_by: string | null;
  registration_enabled: boolean;
  registration_share_token: string;
  registration_fields: EventRegistrationField[];
  registration_bilingual: BilingualConfig | null;
  // Also send the pass on WhatsApp (migration 0134).
  registration_pass_whatsapp: boolean;
  registration_capacity: number | null;
  registration_closes_at: string | null;
  registration_pass_color: string;
  registration_pass_message: string | null;
  registration_pass_background_url: string | null;
  // The event's flyer image in the event-flyers bucket (migration 0176).
  flyer_path: string | null;
  reminder_offset: EventReminderOffset | null;
  // Null/false when payment isn't required. "external" has no API/webhook
  // into whatever gateway the organizer actually uses (Stripe, PayPal,
  // their own Razorpay Payment Page, ...), so payment there is always
  // confirmed manually by staff — see EventRegistrationPaymentStatus.
  payment_required: boolean;
  payment_gateway: EventPaymentGateway | null;
  payment_amount: number | null;
  external_payment_url: string | null;
  payment_timing: EventPaymentTiming | null;
  created_at: string;
  updated_at: string;
};

export type EventPaymentGateway = "platform" | "external";
// "before_registration": the confirmation pass is withheld until
// payment_status flips to 'paid'. "at_checkin": the pass is sent
// immediately regardless of payment status; payment is just collected/
// confirmed later, with no effect on check-in itself (staff discretion).
// "both": the visitor chooses for themselves at registration time — the
// pass is withheld the same as "before_registration" until they either
// pay or explicitly defer, at which point it's sent immediately either way.
export type EventPaymentTiming = "before_registration" | "at_checkin" | "both";

export type EventRegistrationStatus = "confirmed" | "cancelled" | "checked_in";
export type EventRegistrationPaymentStatus = "not_required" | "pending" | "paid";

export type EventRegistration = {
  id: string;
  event_id: string;
  organization_id: string;
  email: string;
  phone: string | null;
  answers: Record<string, string | number | boolean | null>;
  confirmation_code: string;
  // Unguessable id for the public /pass/{token} page (migration 0135).
  pass_token: string;
  status: EventRegistrationStatus;
  checked_in_at: string | null;
  last_reminder_occurrence_date: string | null;
  last_reminder_sent_at: string | null;
  payment_status: EventRegistrationPaymentStatus;
  payment_amount: number | null;
  paid_at: string | null;
  created_at: string;
};

export type EventRegistrationPaymentOrderStatus = "created" | "paid" | "failed";

export type EventRegistrationPaymentOrder = {
  id: string;
  organization_id: string;
  event_id: string;
  registration_id: string;
  // Legacy — no live Razorpay orders were ever created. New orders use
  // payu_txnid/payu_mihpayid instead.
  razorpay_order_id: string | null;
  amount: number;
  status: EventRegistrationPaymentOrderStatus;
  razorpay_payment_id: string | null;
  payu_txnid: string | null;
  payu_mihpayid: string | null;
  created_at: string;
  updated_at: string;
};

// Manual payout ledger for platform-gateway events — a platform operator
// wires money to the church externally and records it here afterwards.
// Nothing here moves money automatically. Mirrors fundraiser_payouts.
export type EventPayout = {
  id: string;
  organization_id: string;
  event_id: string;
  amount: number;
  note: string | null;
  paid_by: string | null;
  created_at: string;
};

export type PlatformSubscriptionPayment = {
  id: string;
  organization_id: string | null;
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  plan_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  created_at: string;
};

export type PlatformInvestment = {
  id: string;
  invested_on: string;
  amount: number;
  investor: string;
  category: "capital" | "investor" | "loan" | "grant" | "other";
  purpose: string | null;
  reference: string | null;
  created_by: string | null;
  created_at: string;
};

export type PlatformExpense = {
  id: string;
  service: string;
  description: string;
  vendor: string | null;
  amount: number;
  currency: string;
  paid_on: string;
  reference: string | null;
  created_by: string | null;
  created_at: string;
};

export type MembershipInvoiceStatus = "due" | "paid" | "cancelled";

export type MembershipFeeSettings = {
  organization_id: string;
  enabled: boolean;
  amount: number | null;
  due_day: number;
  reminder_after_days: number;
  updated_by: string | null;
  updated_at: string;
};

export type MembershipFeeInvoice = {
  id: string;
  organization_id: string;
  member_id: string;
  period: string;
  amount: number;
  status: MembershipInvoiceStatus;
  public_token: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  payu_txnid: string | null;
  payu_mihpayid: string | null;
  paid_at: string | null;
  request_sent_at: string | null;
  request_via: "shared" | "own" | null;
  reminder_sent_at: string | null;
  reminder_via: "shared" | "own" | null;
  receipt_sent_at: string | null;
  receipt_via: "shared" | "own" | null;
  created_at: string;
  updated_at: string;
};

export type MembershipPayoutRequest = {
  id: string;
  organization_id: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  payout_method: PayoutMethod;
  upi_id: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  requested_by: string | null;
  resolved_payout_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MembershipPayout = {
  id: string;
  organization_id: string;
  amount: number;
  note: string | null;
  paid_by: string | null;
  created_at: string;
};

export type EventPayoutRequestStatus = "pending" | "paid" | "cancelled";

export type EventPayoutRequest = {
  id: string;
  organization_id: string;
  event_id: string;
  amount: number;
  status: EventPayoutRequestStatus;
  requested_by: string | null;
  resolved_payout_id: string | null;
  payout_method: PayoutMethod | null;
  upi_id: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceSession = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  event_id: string | null;
  // Set when the register is explicitly marked complete. Null means the
  // session was never recorded, so absence can't be inferred from it.
  recorded_at: string | null;
  occurrence_date: string;
  title: string;
  notes: string | null;
  headcount: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceRecord = {
  id: string;
  organization_id: string;
  session_id: string;
  member_id: string;
  created_at: string;
};

export type FundraiserStatus = "active" | "completed" | "cancelled";
export type FundraiserPaymentMode = "own" | "shared";

export type Fundraiser = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  goal_amount: number;
  branch_id: string | null;
  managed_by: string | null;
  start_date: string | null;
  end_date: string | null;
  status: FundraiserStatus;
  payment_mode: FundraiserPaymentMode | null;
  payment_link_enabled: boolean;
  share_token: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationRazorpayAccount = {
  id: string;
  organization_id: string;
  key_id: string;
  key_secret: string;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationGatewayAccount = {
  id: string;
  organization_id: string;
  gateway: "payu" | "cashfree";
  key_id: string;
  key_secret: string;
  environment: "live" | "test";
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PayoutMethod = "upi" | "bank_transfer";

// Where the platform should actually wire money for a Fund Raiser or
// Event payout — one shared profile per org, independent of which
// feature collected the money.
export type OrganizationPayoutDetailsRow = {
  id: string;
  organization_id: string;
  payout_method: PayoutMethod;
  upi_id: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FundraiserPaymentOrderStatus = "created" | "paid" | "failed";

export type FundraiserPaymentOrder = {
  id: string;
  organization_id: string;
  fundraiser_id: string | null;
  gateway: "razorpay" | "payu" | "cashfree";
  cashfree_order_id: string | null;
  giving_type: "fundraiser" | "offering" | "tithe" | "donation";
  offering_id: string | null;
  razorpay_order_id: string | null;
  amount: number;
  payment_mode: FundraiserPaymentMode;
  status: FundraiserPaymentOrderStatus;
  razorpay_payment_id: string | null;
  payu_txnid: string | null;
  payu_mihpayid: string | null;
  donor_name: string;
  donor_email: string | null;
  donor_phone: string | null;
  donation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FundraiserPayout = {
  id: string;
  organization_id: string;
  fundraiser_id: string;
  amount: number;
  note: string | null;
  paid_by: string | null;
  created_at: string;
};

export type FundraiserPayoutRequestStatus = "pending" | "paid" | "cancelled";

export type FundraiserPayoutRequest = {
  id: string;
  organization_id: string;
  fundraiser_id: string;
  amount: number;
  status: FundraiserPayoutRequestStatus;
  requested_by: string | null;
  resolved_payout_id: string | null;
  // Snapshot of where to send this specific payout — the org's saved
  // organization_payout_details profile can change later, so the
  // request keeps its own fixed copy. Null for requests made before
  // this field existed.
  payout_method: PayoutMethod | null;
  upi_id: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Offering = {
  id: string;
  organization_id: string;
  category: string;
  amount: number;
  collected_on: string;
  branch_id: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountingCategoryType = "income" | "expense";

export type AccountingCategory = {
  id: string;
  organization_id: string;
  name: string;
  type: AccountingCategoryType;
  created_at: string;
  updated_at: string;
};

export type ExpensePaymentMethod = "cash" | "check" | "bank_transfer" | "online" | "other";

export type Expense = {
  id: string;
  organization_id: string;
  category_id: string | null;
  branch_id: string | null;
  amount: number;
  payee: string | null;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollEmployee = {
  id: string;
  organization_id: string;
  name: string;
  job_title: string | null;
  branch_id: string | null;
  monthly_salary: number;
  default_allowances: number;
  default_deductions: number;
  joined_on: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollRunStatus = "draft" | "paid";

export type PayrollRun = {
  id: string;
  organization_id: string;
  // "YYYY-MM"
  pay_month: string;
  status: PayrollRunStatus;
  paid_on: string | null;
  payment_method: ExpensePaymentMethod | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollEntry = {
  id: string;
  run_id: string;
  organization_id: string;
  employee_id: string | null;
  employee_name: string;
  job_title: string | null;
  basic: number;
  allowances: number;
  deductions: number;
  net: number;
  expense_id: string | null;
  created_at: string;
};

export type ConferenceProvider = "zoom" | "google_meet";
export type ConferenceConnection = {
  id: string;
  organization_id: string;
  provider: ConferenceProvider;
  account_id: string;
  account_email: string | null;
  account_name: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};
export type ConferenceMeeting = {
  id: string;
  organization_id: string;
  provider: ConferenceProvider;
  external_id: string;
  title: string;
  start_time: string | null;
  duration_minutes: number | null;
  join_url: string;
  passcode: string | null;
  notified_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type AppFeedbackRow = {
  id: string;
  source: "web" | "android" | "ios";
  organization_id: string | null;
  auth_user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  role: string | null;
  rating: number;
  category: "praise" | "idea" | "problem" | "other";
  message: string;
  screen: string | null;
  app_version: string | null;
  device: string | null;
  status: "new" | "reviewed" | "archived";
  created_at: string;
};

export type DesignRow = {
  id: string;
  organization_id: string;
  name: string;
  kind: "flyer" | "poster" | "social" | "custom";
  width: number;
  height: number;
  // The design document (see src/lib/designer/model.ts), validated on every save.
  doc: import("@/lib/designer/model").DesignDoc;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetLine = {
  id: string;
  organization_id: string;
  // "YYYY-MM"
  budget_month: string;
  category_id: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

export type InvoiceStatus = "unpaid" | "paid" | "cancelled";

export type Invoice = {
  id: string;
  organization_id: string;
  invoice_number: string;
  branch_id: string | null;
  bill_to_name: string;
  bill_to_email: string | null;
  bill_to_address: string | null;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  status: InvoiceStatus;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  organization_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
  created_at: string;
};

export type DonationMethod = "cash" | "check" | "bank_transfer" | "online" | "other";

export type Donation = {
  id: string;
  organization_id: string;
  member_id: string | null;
  donor_name: string | null;
  amount: number;
  donated_on: string;
  method: DonationMethod;
  fundraiser_id: string | null;
  payment_mode: FundraiserPaymentMode | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportTicketCategory = "technical" | "billing" | "feature_request" | "account" | "other";
export type SupportTicketUrgency = "low" | "medium" | "high" | "urgent";
export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type SupportTicket = {
  id: string;
  organization_id: string;
  created_by: string | null;
  subject: string;
  description: string;
  category: SupportTicketCategory;
  urgency: SupportTicketUrgency;
  status: SupportTicketStatus;
  // Screenshots attached to the ticket (migration 0179): { path, name, size }.
  attachments: { path: string; name: string; size: number }[];
  created_at: string;
  updated_at: string;
};

export type SupportTicketMessageAuthorType = "org" | "admin";

export type SupportTicketMessage = {
  id: string;
  ticket_id: string;
  organization_id: string;
  author_type: SupportTicketMessageAuthorType;
  author_id: string | null;
  body: string;
  attachments: { path: string; name: string; size: number }[];
  created_at: string;
};

export type PlatformEventLevel = "info" | "warning" | "error";

export type PlatformEvent = {
  id: string;
  level: PlatformEventLevel;
  source: string;
  message: string;
  organization_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

// A tab/feature with no row here is enabled by default — see
// getDisabledFeatures in src/lib/platform-admin/feature-flags.ts.
export type PlatformFeatureFlag = {
  tab_key: string;
  enabled: boolean;
  // off | testing | beta | live (migration 0137); enabled is false only for off.
  status: "off" | "testing" | "beta" | "live";
  // End of the "New" tag after moving from beta to live.
  new_until: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type MessageDeliveryChannel = "sms" | "whatsapp" | "email";

export type MessageDeliveryEvent = {
  id: string;
  organization_id: string | null;
  channel: MessageDeliveryChannel;
  provider_id: string;
  recipient: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationType =
  | "member_request"
  | "youtube_video_uploaded"
  | "youtube_video_updated"
  | "youtube_live_started"
  | "facebook_post_created"
  | "facebook_post_updated"
  | "support_ticket_reply"
  | "instagram_ai_followup"
  | "whatsapp_ai_followup"
  | "prayer_request"
  | "account_deletion_request"
  | "special_days"
  | "family_request"
  | "visitor"
  | "online_gift"
  | "bible_school_request"
  | "verification";

export type Notification = {
  id: string;
  organization_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type AutomationTemplateKind = "member_direct" | "staff_digest";

export type AutomationTemplate = {
  id: string;
  organization_id: string;
  meta_template_name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  body_text_named: string;
  variable_names: string[];
  kind: AutomationTemplateKind;
  meta_template_id: string | null;
  status: WhatsAppTemplateStatus;
  rejected_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationType = "birthday_anniversary" | "member_followup";
export type AutomationStatus = "draft" | "active" | "paused";

export type Automation = {
  id: string;
  organization_id: string;
  type: AutomationType;
  name: string;
  status: AutomationStatus;
  // Per-type settings, shaped by the type's own module (see
  // src/lib/automations/followup-config.ts for member_followup).
  config: Record<string, unknown>;
  last_run_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationRunStatus = "running" | "completed" | "failed";

export type AutomationRun = {
  id: string;
  organization_id: string;
  automation_id: string;
  run_key: string;
  status: AutomationRunStatus;
  started_at: string;
  completed_at: string | null;
  members_evaluated: number;
  members_qualified: number;
  tasks_created: number;
  notifications_sent: number;
  skipped_count: number;
  error_count: number;
  error_summary: string | null;
};

export type AutomationRunItemOutcome = "task_created" | "skipped_existing_task" | "skipped_data_quality" | "error";

export type AutomationRunItem = {
  id: string;
  run_id: string;
  organization_id: string;
  member_id: string | null;
  outcome: AutomationRunItemOutcome;
  todo_id: string | null;
  error_message: string | null;
  created_at: string;
};

export type AutomationDateFieldSource = "built_in" | "custom_field";
export type AutomationBuiltInField = "date_of_birth" | "wedding_date";

export type AutomationTrigger = {
  id: string;
  automation_id: string;
  organization_id: string;
  date_field_source: AutomationDateFieldSource;
  built_in_field: AutomationBuiltInField | null;
  date_field_id: string | null;
  occasion_label: string;
  days_offset: number;
  template_id: string | null;
  variable_values: Record<string, string>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AutomationDestinationKind = "direct_member" | "staff_digest";

export type AutomationDestination = {
  id: string;
  automation_id: string;
  organization_id: string;
  kind: AutomationDestinationKind;
  is_active: boolean;
  recipient_phones: string[] | null;
  recipient_leader_ids: string[];
  digest_template_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationExecutionStatus = "sent" | "failed" | "skipped";

export type AutomationExecution = {
  id: string;
  organization_id: string;
  automation_id: string;
  destination_kind: AutomationDestinationKind;
  trigger_id: string | null;
  member_id: string | null;
  idempotency_key: string;
  status: AutomationExecutionStatus;
  error_message: string | null;
  meta_message_id: string | null;
  recipient_count: number;
  sent_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> &
          Pick<Profile, "auth_user_id" | "first_name" | "last_name" | "email">;
        Update: Partial<Profile>;
        Relationships: [
          {
            foreignKeyName: "profiles_active_organization_id_fkey";
            columns: ["active_organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: Organization;
        Insert: Partial<Organization> & Pick<Organization, "name" | "slug">;
        Update: Partial<Organization>;
        Relationships: [];
      };
      support_staff: {
        Row: SupportStaff;
        Insert: Partial<SupportStaff> & Pick<SupportStaff, "auth_user_id" | "email" | "name">;
        Update: Partial<SupportStaff>;
        Relationships: [];
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Partial<OrganizationMember> &
          Pick<OrganizationMember, "organization_id" | "auth_user_id">;
        Update: Partial<OrganizationMember>;
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_profile_fk";
            columns: ["auth_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      organization_invitations: {
        Row: OrganizationInvitation;
        Insert: Partial<OrganizationInvitation> &
          Pick<OrganizationInvitation, "organization_id" | "email">;
        Update: Partial<OrganizationInvitation>;
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_attempts: {
        Row: { id: number; key: string; created_at: string };
        Insert: { key: string; created_at?: string };
        Update: Partial<{ key: string; created_at: string }>;
        Relationships: [];
      };
      deletion_form_requests: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          church_name: string | null;
          relationship: string;
          scope: string;
          details: string | null;
          status: string;
          token_hash: string | null;
          token_expires_at: string | null;
          verified_at: string | null;
          outcome_note: string | null;
          processed_by: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          email: string;
          phone?: string | null;
          church_name?: string | null;
          relationship: string;
          scope?: string;
          details?: string | null;
          status?: string;
          token_hash?: string | null;
          token_expires_at?: string | null;
        };
        Update: Partial<{
          name: string;
          email: string;
          phone: string | null;
          church_name: string | null;
          relationship: string;
          scope: string;
          details: string | null;
          status: string;
          token_hash: string | null;
          token_expires_at: string | null;
          verified_at: string | null;
          outcome_note: string | null;
          processed_by: string | null;
          processed_at: string | null;
        }>;
        Relationships: [];
      };
      module_pricing: {
        Row: { module_key: string; monthly_price: number; is_default: boolean; updated_at: string };
        Insert: Partial<{ module_key: string; monthly_price: number; is_default: boolean; updated_at: string }> & { module_key: string };
        Update: Partial<{ module_key: string; monthly_price: number; is_default: boolean; updated_at: string }>;
        Relationships: [];
      };
      tenant_onboarding: {
        Row: {
          organization_id: string;
          status: string;
          modules: string[];
          plan_type: string;
          credits: Record<string, { count: number; price: number }>;
          monthly_base: number;
          notes: string;
          started_by: string | null;
          sent_at: string | null;
          activated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          status?: string;
          modules?: string[];
          plan_type?: string;
          credits?: Record<string, { count: number; price: number }>;
          monthly_base?: number;
          notes?: string;
          started_by?: string | null;
          sent_at?: string | null;
          activated_at?: string | null;
          updated_at?: string;
        };
        Update: {
          status?: string;
          modules?: string[];
          plan_type?: string;
          credits?: Record<string, { count: number; price: number }>;
          monthly_base?: number;
          notes?: string;
          sent_at?: string | null;
          activated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_onboarding_documents: {
        Row: {
          id: string;
          organization_id: string;
          doc_type: string;
          file_name: string;
          file_path: string;
          status: string;
          note: string;
          uploaded_by: string | null;
          verified_at: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          doc_type: string;
          file_name: string;
          file_path: string;
          status?: string;
          note?: string;
          uploaded_by?: string | null;
          verified_at?: string | null;
        };
        Update: { status?: string; note?: string; verified_at?: string | null };
        Relationships: [];
      };
      organization_subscriptions: {
        Row: OrganizationSubscription;
        Insert: Partial<OrganizationSubscription> & Pick<OrganizationSubscription, "organization_id" | "plan_id">;
        Update: Partial<OrganizationSubscription>;
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_charges: {
        Row: SubscriptionCharge;
        Insert: Partial<SubscriptionCharge> & Pick<SubscriptionCharge, "organization_id" | "subscription_id" | "txnid" | "amount" | "status">;
        Update: Partial<SubscriptionCharge>;
        Relationships: [
          {
            foreignKeyName: "subscription_charges_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_charges_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "organization_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_addon_orders: {
        Row: OrganizationAddonOrder;
        Insert: Partial<OrganizationAddonOrder> &
          Pick<OrganizationAddonOrder, "organization_id" | "addon_type" | "pack_id" | "credits" | "amount" | "payu_txnid">;
        Update: Partial<OrganizationAddonOrder>;
        Relationships: [
          {
            foreignKeyName: "organization_addon_orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: Branch;
        Insert: Partial<Branch> & Pick<Branch, "organization_id" | "name">;
        Update: Partial<Branch>;
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branches_managed_by_fkey";
            columns: ["managed_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      member_field_definitions: {
        Row: MemberFieldDefinition;
        Insert: Partial<MemberFieldDefinition> &
          Pick<MemberFieldDefinition, "organization_id" | "key" | "label" | "field_type">;
        Update: Partial<MemberFieldDefinition>;
        Relationships: [
          {
            foreignKeyName: "member_field_definitions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: Member;
        Insert: Partial<Member> & Pick<Member, "organization_id" | "first_name" | "last_name">;
        Update: Partial<Member>;
        Relationships: [
          {
            foreignKeyName: "members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "members_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      member_profile_update_requests: {
        Row: MemberProfileUpdateRequest;
        Insert: Partial<MemberProfileUpdateRequest> &
          Pick<MemberProfileUpdateRequest, "organization_id" | "member_id" | "proposed_changes">;
        Update: Partial<MemberProfileUpdateRequest>;
        Relationships: [
          {
            foreignKeyName: "member_profile_update_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_profile_update_requests_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      family_requests: {
        Row: FamilyRequest;
        Insert: Partial<FamilyRequest> &
          Pick<FamilyRequest, "organization_id" | "requested_by" | "name" | "requester_relationship">;
        Update: Partial<FamilyRequest>;
        Relationships: [
          {
            foreignKeyName: "family_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_investments: {
        Row: PlatformInvestment;
        Insert: Partial<PlatformInvestment> & Pick<PlatformInvestment, "invested_on" | "amount" | "investor">;
        Update: Partial<PlatformInvestment>;
        Relationships: [];
      };
      external_live_streams: {
        Row: ExternalLiveStream;
        Insert: Partial<ExternalLiveStream> & Pick<ExternalLiveStream, "organization_id" | "title" | "platform" | "url">;
        Update: Partial<ExternalLiveStream>;
        Relationships: [];
      };
      projection_screens: {
        Row: ProjectionScreen;
        Insert: Partial<ProjectionScreen> & Pick<ProjectionScreen, "organization_id">;
        Update: Partial<ProjectionScreen>;
        Relationships: [];
      };
      projection_items: {
        Row: ProjectionItem;
        Insert: Partial<ProjectionItem> & Pick<ProjectionItem, "organization_id" | "kind" | "title" | "body">;
        Update: Partial<ProjectionItem>;
        Relationships: [];
      };
      bible_translations: {
        Row: BibleTranslation;
        Insert: Partial<BibleTranslation> & Pick<BibleTranslation, "organization_id" | "code" | "name">;
        Update: Partial<BibleTranslation>;
        Relationships: [];
      };
      bible_custom_verses: {
        Row: BibleCustomVerse;
        Insert: Partial<BibleCustomVerse> & Pick<BibleCustomVerse, "translation_id" | "book" | "chapter" | "verse" | "text">;
        Update: Partial<BibleCustomVerse>;
        Relationships: [];
      };
      visitor_passes: {
        Row: VisitorPass;
        Insert: Partial<VisitorPass> & Pick<VisitorPass, "organization_id" | "visitor_id" | "code" | "visit_date" | "valid_until">;
        Update: Partial<VisitorPass>;
        Relationships: [
          {
            foreignKeyName: "visitor_passes_visitor_id_fkey";
            columns: ["visitor_id"];
            isOneToOne: false;
            referencedRelation: "visitors";
            referencedColumns: ["id"];
          },
        ];
      };
      visitors: {
        Row: Visitor;
        Insert: Partial<Visitor> & Pick<Visitor, "organization_id" | "name" | "phone" | "phone_key" | "first_visited_on" | "last_visited_on">;
        Update: Partial<Visitor>;
        Relationships: [
          {
            foreignKeyName: "visitors_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_reports: {
        Row: CustomReport;
        Insert: Partial<CustomReport> & Pick<CustomReport, "organization_id" | "name" | "source">;
        Update: Partial<CustomReport>;
        Relationships: [
          {
            foreignKeyName: "custom_reports_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_module_subscriptions: {
        Row: OrganizationModuleSubscription;
        Insert: Partial<OrganizationModuleSubscription> & Pick<OrganizationModuleSubscription, "organization_id" | "module_key" | "monthly_amount">;
        Update: Partial<OrganizationModuleSubscription>;
        Relationships: [
          {
            foreignKeyName: "organization_module_subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: Notification;
        Insert: Partial<Notification> & Pick<Notification, "organization_id" | "title">;
        Update: Partial<Notification>;
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      media_team_members: {
        Row: MediaTeamMember;
        Insert: Partial<MediaTeamMember> & Pick<MediaTeamMember, "organization_id" | "member_id" | "role">;
        Update: Partial<MediaTeamMember>;
        Relationships: [
          {
            foreignKeyName: "media_team_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_team_members_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      media_equipment: {
        Row: MediaEquipment;
        Insert: Partial<MediaEquipment> & Pick<MediaEquipment, "organization_id" | "name">;
        Update: Partial<MediaEquipment>;
        Relationships: [
          {
            foreignKeyName: "media_equipment_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_equipment_managed_by_fkey";
            columns: ["managed_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      media_social_accounts: {
        Row: MediaSocialAccount;
        Insert: Partial<MediaSocialAccount> & Pick<MediaSocialAccount, "organization_id" | "platform">;
        Update: Partial<MediaSocialAccount>;
        Relationships: [
          {
            foreignKeyName: "media_social_accounts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_social_accounts_managed_by_fkey";
            columns: ["managed_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      media_documents: {
        Row: MediaDocument;
        Insert: Partial<MediaDocument> &
          Pick<MediaDocument, "organization_id" | "title" | "file_path" | "file_type" | "file_size">;
        Update: Partial<MediaDocument>;
        Relationships: [
          {
            foreignKeyName: "media_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      ministries: {
        Row: Ministry;
        Insert: Partial<Ministry> & Pick<Ministry, "organization_id" | "title">;
        Update: Partial<Ministry>;
        Relationships: [
          {
            foreignKeyName: "ministries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ministries_managed_by_fkey";
            columns: ["managed_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      fundraisers: {
        Row: Fundraiser;
        Insert: Partial<Fundraiser> & Pick<Fundraiser, "organization_id" | "title" | "goal_amount">;
        Update: Partial<Fundraiser>;
        Relationships: [
          {
            foreignKeyName: "fundraisers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fundraisers_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fundraisers_managed_by_fkey";
            columns: ["managed_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      offerings: {
        Row: Offering;
        Insert: Partial<Offering> & Pick<Offering, "organization_id" | "category" | "amount" | "collected_on">;
        Update: Partial<Offering>;
        Relationships: [
          {
            foreignKeyName: "offerings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offerings_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      donations: {
        Row: Donation;
        Insert: Partial<Donation> & Pick<Donation, "organization_id" | "amount" | "donated_on">;
        Update: Partial<Donation>;
        Relationships: [
          {
            foreignKeyName: "donations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "donations_fundraiser_id_fkey";
            columns: ["fundraiser_id"];
            isOneToOne: false;
            referencedRelation: "fundraisers";
            referencedColumns: ["id"];
          },
        ];
      };
      accounting_categories: {
        Row: AccountingCategory;
        Insert: Partial<AccountingCategory> & Pick<AccountingCategory, "organization_id" | "name" | "type">;
        Update: Partial<AccountingCategory>;
        Relationships: [
          {
            foreignKeyName: "accounting_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: Expense;
        Insert: Partial<Expense> & Pick<Expense, "organization_id" | "amount" | "expense_date">;
        Update: Partial<Expense>;
        Relationships: [
          {
            foreignKeyName: "expenses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "accounting_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      payroll_employees: {
        Row: PayrollEmployee;
        Insert: Partial<PayrollEmployee> & Pick<PayrollEmployee, "organization_id" | "name" | "monthly_salary">;
        Update: Partial<PayrollEmployee>;
        Relationships: [];
      };
      payroll_runs: {
        Row: PayrollRun;
        Insert: Partial<PayrollRun> & Pick<PayrollRun, "organization_id" | "pay_month">;
        Update: Partial<PayrollRun>;
        Relationships: [];
      };
      payroll_entries: {
        Row: PayrollEntry;
        Insert: Partial<PayrollEntry> & Pick<PayrollEntry, "run_id" | "organization_id" | "employee_name" | "basic" | "net">;
        Update: Partial<PayrollEntry>;
        Relationships: [];
      };
      conference_connections: {
        Row: ConferenceConnection;
        Insert: Partial<ConferenceConnection> & Pick<ConferenceConnection, "organization_id" | "provider" | "account_id" | "access_token" | "refresh_token" | "token_expires_at">;
        Update: Partial<ConferenceConnection>;
        Relationships: [];
      };
      conference_meetings: {
        Row: ConferenceMeeting;
        Insert: Partial<ConferenceMeeting> & Pick<ConferenceMeeting, "organization_id" | "provider" | "external_id" | "title" | "join_url">;
        Update: Partial<ConferenceMeeting>;
        Relationships: [];
      };
      app_feedback: {
        Row: AppFeedbackRow;
        Insert: Partial<AppFeedbackRow> & Pick<AppFeedbackRow, "source" | "rating">;
        Update: Partial<AppFeedbackRow>;
        Relationships: [];
      };
      designs: {
        Row: DesignRow;
        Insert: Partial<DesignRow> & Pick<DesignRow, "organization_id" | "name" | "width" | "height" | "doc">;
        Update: Partial<DesignRow>;
        Relationships: [];
      };
      budget_lines: {
        Row: BudgetLine;
        Insert: Partial<BudgetLine> & Pick<BudgetLine, "organization_id" | "budget_month" | "category_id" | "amount">;
        Update: Partial<BudgetLine>;
        Relationships: [];
      };
      invoices: {
        Row: Invoice;
        Insert: Partial<Invoice> & Pick<Invoice, "organization_id" | "invoice_number" | "bill_to_name" | "issue_date">;
        Update: Partial<Invoice>;
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_items: {
        Row: InvoiceItem;
        Insert: Partial<InvoiceItem> & Pick<InvoiceItem, "invoice_id" | "organization_id" | "description" | "unit_price" | "amount">;
        Update: Partial<InvoiceItem>;
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_gateway_accounts: {
        Row: OrganizationGatewayAccount;
        Insert: Partial<OrganizationGatewayAccount> & Pick<OrganizationGatewayAccount, "organization_id" | "gateway" | "key_id" | "key_secret">;
        Update: Partial<OrganizationGatewayAccount>;
        Relationships: [];
      };
      organization_razorpay_accounts: {
        Row: OrganizationRazorpayAccount;
        Insert: Partial<OrganizationRazorpayAccount> & Pick<OrganizationRazorpayAccount, "organization_id" | "key_id" | "key_secret">;
        Update: Partial<OrganizationRazorpayAccount>;
        Relationships: [
          {
            foreignKeyName: "organization_razorpay_accounts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_payout_details: {
        Row: OrganizationPayoutDetailsRow;
        Insert: Partial<OrganizationPayoutDetailsRow> & Pick<OrganizationPayoutDetailsRow, "organization_id" | "payout_method">;
        Update: Partial<OrganizationPayoutDetailsRow>;
        Relationships: [
          {
            foreignKeyName: "organization_payout_details_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fundraiser_payment_orders: {
        Row: FundraiserPaymentOrder;
        Insert: Partial<FundraiserPaymentOrder> &
          Pick<FundraiserPaymentOrder, "organization_id" | "amount" | "payment_mode" | "donor_name">;
        Update: Partial<FundraiserPaymentOrder>;
        Relationships: [
          {
            foreignKeyName: "fundraiser_payment_orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fundraiser_payment_orders_fundraiser_id_fkey";
            columns: ["fundraiser_id"];
            isOneToOne: false;
            referencedRelation: "fundraisers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fundraiser_payment_orders_donation_id_fkey";
            columns: ["donation_id"];
            isOneToOne: false;
            referencedRelation: "donations";
            referencedColumns: ["id"];
          },
        ];
      };
      fundraiser_payouts: {
        Row: FundraiserPayout;
        Insert: Partial<FundraiserPayout> & Pick<FundraiserPayout, "organization_id" | "fundraiser_id" | "amount">;
        Update: Partial<FundraiserPayout>;
        Relationships: [
          {
            foreignKeyName: "fundraiser_payouts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fundraiser_payouts_fundraiser_id_fkey";
            columns: ["fundraiser_id"];
            isOneToOne: false;
            referencedRelation: "fundraisers";
            referencedColumns: ["id"];
          },
        ];
      };
      fundraiser_payout_requests: {
        Row: FundraiserPayoutRequest;
        Insert: Partial<FundraiserPayoutRequest> & Pick<FundraiserPayoutRequest, "organization_id" | "fundraiser_id" | "amount">;
        Update: Partial<FundraiserPayoutRequest>;
        Relationships: [
          {
            foreignKeyName: "fundraiser_payout_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fundraiser_payout_requests_fundraiser_id_fkey";
            columns: ["fundraiser_id"];
            isOneToOne: false;
            referencedRelation: "fundraisers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fundraiser_payout_requests_resolved_payout_id_fkey";
            columns: ["resolved_payout_id"];
            isOneToOne: false;
            referencedRelation: "fundraiser_payouts";
            referencedColumns: ["id"];
          },
        ];
      };
      prayer_requests: {
        Row: PrayerRequest;
        Insert: Partial<PrayerRequest> & Pick<PrayerRequest, "organization_id" | "member_id" | "request">;
        Update: Partial<PrayerRequest>;
        Relationships: [
          {
            foreignKeyName: "prayer_requests_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_whatsapp_templates: {
        Row: PlatformWhatsAppTemplate;
        Insert: Partial<PlatformWhatsAppTemplate> & Pick<PlatformWhatsAppTemplate, "catalog_key" | "name" | "category" | "body_text">;
        Update: Partial<PlatformWhatsAppTemplate>;
        Relationships: [];
      };
      organization_whatsapp_connections: {
        Row: OrganizationWhatsAppConnection;
        Insert: Partial<OrganizationWhatsAppConnection> & Pick<OrganizationWhatsAppConnection, "organization_id" | "connection_method" | "waba_id" | "phone_number_id" | "access_token_encrypted">;
        Update: Partial<OrganizationWhatsAppConnection>;
        Relationships: [];
      };
      member_home_layouts: {
        Row: MemberHomeLayoutRow;
        Insert: Partial<MemberHomeLayoutRow> & Pick<MemberHomeLayoutRow, "organization_id" | "status" | "layout">;
        Update: Partial<MemberHomeLayoutRow>;
        Relationships: [];
      };
      cron_job_runs: {
        Row: CronJobRun;
        Insert: Partial<CronJobRun> & Pick<CronJobRun, "job_key" | "trigger">;
        Update: Partial<CronJobRun>;
        Relationships: [];
      };
      platform_events: {
        Row: PlatformEvent;
        Insert: Partial<PlatformEvent> & Pick<PlatformEvent, "level" | "source" | "message">;
        Update: Partial<PlatformEvent>;
        Relationships: [
          {
            foreignKeyName: "platform_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_feature_flags: {
        Row: PlatformFeatureFlag;
        Insert: Partial<PlatformFeatureFlag> & Pick<PlatformFeatureFlag, "tab_key">;
        Update: Partial<PlatformFeatureFlag>;
        Relationships: [
          {
            foreignKeyName: "platform_feature_flags_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      message_delivery_events: {
        Row: MessageDeliveryEvent;
        Insert: Partial<MessageDeliveryEvent> & Pick<MessageDeliveryEvent, "channel" | "provider_id" | "status">;
        Update: Partial<MessageDeliveryEvent>;
        Relationships: [
          {
            foreignKeyName: "message_delivery_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: SupportTicket;
        Insert: Partial<SupportTicket> & Pick<SupportTicket, "organization_id" | "subject" | "description" | "category">;
        Update: Partial<SupportTicket>;
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_tickets_profile_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      support_ticket_messages: {
        Row: SupportTicketMessage;
        Insert: Partial<SupportTicketMessage> & Pick<SupportTicketMessage, "ticket_id" | "organization_id" | "author_type" | "body">;
        Update: Partial<SupportTicketMessage>;
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_ticket_messages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_ticket_messages_profile_fk";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      leaders: {
        Row: Leader;
        Insert: Partial<Leader> & Pick<Leader, "organization_id" | "member_id">;
        Update: Partial<Leader>;
        Relationships: [
          {
            foreignKeyName: "leaders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leaders_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      forms: {
        Row: CustomForm;
        Insert: Partial<CustomForm> & Pick<CustomForm, "organization_id" | "title" | "slug">;
        Update: Partial<CustomForm>;
        Relationships: [
          {
            foreignKeyName: "forms_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      form_responses: {
        Row: FormResponse;
        Insert: Partial<FormResponse> & Pick<FormResponse, "form_id" | "organization_id">;
        Update: Partial<FormResponse>;
        Relationships: [
          {
            foreignKeyName: "form_responses_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_responses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      shared_documents: {
        Row: SharedDocument;
        Insert: Partial<SharedDocument> & Pick<SharedDocument, "organization_id" | "title" | "file_path" | "file_type" | "file_size">;
        Update: Partial<SharedDocument>;
        Relationships: [
          {
            foreignKeyName: "shared_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shared_documents_profile_fk";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
          {
            foreignKeyName: "shared_documents_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "folder_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      folder_categories: {
        Row: FolderCategory;
        Insert: Partial<FolderCategory> & Pick<FolderCategory, "organization_id" | "name">;
        Update: Partial<FolderCategory>;
        Relationships: [
          {
            foreignKeyName: "folder_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      committee_members: {
        Row: CommitteeMember;
        Insert: Partial<CommitteeMember> & Pick<CommitteeMember, "organization_id" | "member_id" | "committee_name" | "role">;
        Update: Partial<CommitteeMember>;
        Relationships: [
          {
            foreignKeyName: "committee_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "committee_members_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      families: {
        Row: Family;
        Insert: Partial<Family> & Pick<Family, "organization_id" | "name">;
        Update: Partial<Family>;
        Relationships: [
          {
            foreignKeyName: "families_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      family_members: {
        Row: FamilyMember;
        Insert: Partial<FamilyMember> & Pick<FamilyMember, "family_id" | "organization_id" | "member_id" | "relationship">;
        Update: Partial<FamilyMember>;
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_members_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_sessions: {
        Row: AttendanceSession;
        Insert: Partial<AttendanceSession> & Pick<AttendanceSession, "organization_id" | "occurrence_date" | "title">;
        Update: Partial<AttendanceSession>;
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_sessions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_records: {
        Row: AttendanceRecord;
        Insert: Partial<AttendanceRecord> & Pick<AttendanceRecord, "organization_id" | "session_id" | "member_id">;
        Update: Partial<AttendanceRecord>;
        Relationships: [
          {
            foreignKeyName: "attendance_records_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "attendance_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      youths: {
        Row: Youth;
        Insert: Partial<Youth> & Pick<Youth, "organization_id" | "member_id">;
        Update: Partial<Youth>;
        Relationships: [
          {
            foreignKeyName: "youths_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "youths_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      worship_team_members: {
        Row: WorshipTeamMember;
        Insert: Partial<WorshipTeamMember> & Pick<WorshipTeamMember, "organization_id" | "member_id" | "role">;
        Update: Partial<WorshipTeamMember>;
        Relationships: [
          {
            foreignKeyName: "worship_team_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worship_team_members_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      worship_documents: {
        Row: WorshipDocument;
        Insert: Partial<WorshipDocument> &
          Pick<WorshipDocument, "organization_id" | "title" | "file_path" | "file_type" | "file_size">;
        Update: Partial<WorshipDocument>;
        Relationships: [
          {
            foreignKeyName: "worship_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: Event;
        Insert: Partial<Event> & Pick<Event, "organization_id" | "title" | "start_at">;
        Update: Partial<Event>;
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_managed_by_fkey";
            columns: ["managed_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      event_registrations: {
        Row: EventRegistration;
        Insert: Partial<EventRegistration> & Pick<EventRegistration, "event_id" | "organization_id" | "email" | "confirmation_code">;
        Update: Partial<EventRegistration>;
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registrations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      event_registration_payment_orders: {
        Row: EventRegistrationPaymentOrder;
        Insert: Partial<EventRegistrationPaymentOrder> &
          Pick<EventRegistrationPaymentOrder, "organization_id" | "event_id" | "registration_id" | "payu_txnid" | "amount">;
        Update: Partial<EventRegistrationPaymentOrder>;
        Relationships: [
          {
            foreignKeyName: "event_registration_payment_orders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registration_payment_orders_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_registration_payment_orders_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: false;
            referencedRelation: "event_registrations";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_subscription_payments: {
        Row: PlatformSubscriptionPayment;
        Insert: Partial<PlatformSubscriptionPayment> &
          Pick<PlatformSubscriptionPayment, "razorpay_subscription_id" | "razorpay_payment_id" | "plan_id" | "amount" | "paid_at">;
        Update: Partial<PlatformSubscriptionPayment>;
        Relationships: [];
      };
      platform_expenses: {
        Row: PlatformExpense;
        Insert: Partial<PlatformExpense> & Pick<PlatformExpense, "service" | "description" | "amount" | "paid_on">;
        Update: Partial<PlatformExpense>;
        Relationships: [];
      };
      membership_fee_settings: {
        Row: MembershipFeeSettings;
        Insert: Partial<MembershipFeeSettings> & Pick<MembershipFeeSettings, "organization_id">;
        Update: Partial<MembershipFeeSettings>;
        Relationships: [];
      };
      membership_fee_invoices: {
        Row: MembershipFeeInvoice;
        Insert: Partial<MembershipFeeInvoice> & Pick<MembershipFeeInvoice, "organization_id" | "member_id" | "period" | "amount">;
        Update: Partial<MembershipFeeInvoice>;
        Relationships: [];
      };
      membership_payout_requests: {
        Row: MembershipPayoutRequest;
        Insert: Partial<MembershipPayoutRequest> & Pick<MembershipPayoutRequest, "organization_id" | "amount" | "payout_method">;
        Update: Partial<MembershipPayoutRequest>;
        Relationships: [];
      };
      membership_payouts: {
        Row: MembershipPayout;
        Insert: Partial<MembershipPayout> & Pick<MembershipPayout, "organization_id" | "amount">;
        Update: Partial<MembershipPayout>;
        Relationships: [];
      };
      event_payouts: {
        Row: EventPayout;
        Insert: Partial<EventPayout> & Pick<EventPayout, "organization_id" | "event_id" | "amount">;
        Update: Partial<EventPayout>;
        Relationships: [
          {
            foreignKeyName: "event_payouts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_payouts_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_payout_requests: {
        Row: EventPayoutRequest;
        Insert: Partial<EventPayoutRequest> & Pick<EventPayoutRequest, "organization_id" | "event_id" | "amount">;
        Update: Partial<EventPayoutRequest>;
        Relationships: [
          {
            foreignKeyName: "event_payout_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_payout_requests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_payout_requests_resolved_payout_id_fkey";
            columns: ["resolved_payout_id"];
            isOneToOne: false;
            referencedRelation: "event_payouts";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_message_log: {
        Row: WhatsAppMessageLog;
        Insert: Partial<WhatsAppMessageLog> & Pick<WhatsAppMessageLog, "organization_id" | "kind" | "recipient" | "wamid" | "sender_key">;
        Update: Partial<WhatsAppMessageLog>;
        Relationships: [];
      };
      whatsapp_contact_health: {
        Row: WhatsAppContactHealth;
        Insert: Partial<WhatsAppContactHealth> & Pick<WhatsAppContactHealth, "sender_key" | "recipient">;
        Update: Partial<WhatsAppContactHealth>;
        Relationships: [];
      };
      group_posts: {
        Row: GroupPost;
        Insert: Partial<GroupPost> & Pick<GroupPost, "organization_id" | "group_key" | "title">;
        Update: Partial<GroupPost>;
        Relationships: [];
      };
      push_broadcasts: {
        Row: PushBroadcast;
        Insert: Partial<PushBroadcast> & Pick<PushBroadcast, "organization_id" | "audience" | "title" | "body">;
        Update: Partial<PushBroadcast>;
        Relationships: [];
      };
      special_day_digests: {
        Row: { organization_id: string; day: string; kind: string; created_at: string };
        Insert: { organization_id: string; day: string; kind?: string; created_at?: string };
        Update: Partial<{ organization_id: string; day: string; kind: string; created_at: string }>;
        Relationships: [];
      };
      special_day_pushes: {
        Row: SpecialDayPush;
        Insert: Partial<SpecialDayPush> & Pick<SpecialDayPush, "member_id" | "kind" | "year">;
        Update: Partial<SpecialDayPush>;
        Relationships: [];
      };
      account_deletion_requests: {
        Row: AccountDeletionRequest;
        Insert: Partial<AccountDeletionRequest> & Pick<AccountDeletionRequest, "auth_user_id" | "requester_kind" | "display_name">;
        Update: Partial<AccountDeletionRequest>;
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      todo_events: {
        Row: TodoEvent;
        Insert: Partial<TodoEvent> & Pick<TodoEvent, "organization_id" | "title">;
        Update: Partial<TodoEvent>;
        Relationships: [];
      };
      todos: {
        Row: Todo;
        Insert: Partial<Todo> & Pick<Todo, "organization_id" | "title">;
        Update: Partial<Todo>;
        Relationships: [
          {
            foreignKeyName: "todos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "todos_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
          {
            foreignKeyName: "todos_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
          {
            foreignKeyName: "todos_assigned_member_id_fkey";
            columns: ["assigned_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "todos_todo_event_id_fkey";
            columns: ["todo_event_id"];
            isOneToOne: false;
            referencedRelation: "todo_events";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: Plan;
        Insert: Partial<Plan> & Pick<Plan, "organization_id" | "title">;
        Update: Partial<Plan>;
        Relationships: [
          {
            foreignKeyName: "plans_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plans_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      report_templates: {
        Row: ReportTemplate;
        Insert: Partial<ReportTemplate> & Pick<ReportTemplate, "organization_id" | "name">;
        Update: Partial<ReportTemplate>;
        Relationships: [];
      };
      monthly_reports: {
        Row: MonthlyReport;
        Insert: Partial<MonthlyReport> & Pick<MonthlyReport, "organization_id" | "period" | "title">;
        Update: Partial<MonthlyReport>;
        Relationships: [];
      };
      volunteers: {
        Row: Volunteer;
        Insert: Partial<Volunteer> & Pick<Volunteer, "organization_id" | "member_id" | "role">;
        Update: Partial<Volunteer>;
        Relationships: [
          {
            foreignKeyName: "volunteers_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_retention: {
        Row: OrganizationRetention;
        Insert: Partial<OrganizationRetention> & Pick<OrganizationRetention, "organization_id">;
        Update: Partial<OrganizationRetention>;
        Relationships: [];
      };
      platform_settings: {
        Row: PlatformSetting;
        Insert: Partial<PlatformSetting> & Pick<PlatformSetting, "key">;
        Update: Partial<PlatformSetting>;
        Relationships: [];
      };
      deleted_organizations: {
        Row: DeletedOrganization;
        Insert: Partial<DeletedOrganization> & Pick<DeletedOrganization, "organization_id" | "name">;
        Update: Partial<DeletedOrganization>;
        Relationships: [];
      };
      mobile_app_devices: {
        Row: MobileAppDevice;
        Insert: Partial<MobileAppDevice> & Pick<MobileAppDevice, "device_id" | "platform">;
        Update: Partial<MobileAppDevice>;
        Relationships: [];
      };
      mobile_app_events: {
        Row: MobileAppEvent;
        Insert: Partial<MobileAppEvent> & Pick<MobileAppEvent, "device_id" | "kind">;
        Update: Partial<MobileAppEvent>;
        Relationships: [];
      };
      member_notifications: {
        Row: MemberNotification;
        Insert: Partial<MemberNotification> & Pick<MemberNotification, "auth_user_id" | "category" | "title">;
        Update: Partial<MemberNotification>;
        Relationships: [];
      };
      live_streams: {
        Row: LiveStream;
        Insert: Partial<LiveStream> & Pick<LiveStream, "organization_id" | "meeting_id" | "title">;
        Update: Partial<LiveStream>;
        Relationships: [];
      };
      bible_school_access: {
        Row: BibleSchoolAccess;
        Insert: Partial<BibleSchoolAccess> & Pick<BibleSchoolAccess, "organization_id">;
        Update: Partial<BibleSchoolAccess>;
        Relationships: [];
      };
      live_stream_access: {
        Row: LiveStreamAccess;
        Insert: Partial<LiveStreamAccess> & Pick<LiveStreamAccess, "organization_id">;
        Update: Partial<LiveStreamAccess>;
        Relationships: [];
      };
      organization_billing_details: {
        Row: OrganizationBillingDetails;
        Insert: Partial<OrganizationBillingDetails> & Pick<OrganizationBillingDetails, "organization_id" | "legal_name" | "address_line1" | "city" | "state" | "pincode" | "email">;
        Update: Partial<OrganizationBillingDetails>;
        Relationships: [];
      };
      platform_invoices: {
        Row: PlatformInvoice;
        Insert: Partial<PlatformInvoice> & Pick<PlatformInvoice, "organization_id" | "invoice_number" | "kind" | "reference" | "buyer" | "seller" | "template" | "line_items" | "subtotal" | "total">;
        Update: Partial<PlatformInvoice>;
        Relationships: [];
      };
      email_templates: {
        Row: EmailTemplate;
        Insert: Partial<EmailTemplate> & Pick<EmailTemplate, "organization_id" | "name">;
        Update: Partial<EmailTemplate>;
        Relationships: [];
      };
      lms_settings: {
        Row: LmsSettings;
        Insert: Partial<LmsSettings> & Pick<LmsSettings, "organization_id">;
        Update: Partial<LmsSettings>;
        Relationships: [];
      };
      lms_programs: {
        Row: LmsProgram;
        Insert: Partial<LmsProgram> & Pick<LmsProgram, "organization_id" | "title">;
        Update: Partial<LmsProgram>;
        Relationships: [];
      };
      lms_courses: {
        Row: LmsCourse;
        Insert: Partial<LmsCourse> & Pick<LmsCourse, "organization_id" | "title">;
        Update: Partial<LmsCourse>;
        Relationships: [];
      };
      lms_program_courses: {
        Row: LmsProgramCourse;
        Insert: Partial<LmsProgramCourse> & Pick<LmsProgramCourse, "program_id" | "course_id" | "organization_id">;
        Update: Partial<LmsProgramCourse>;
        Relationships: [];
      };
      lms_course_prerequisites: {
        Row: LmsCoursePrerequisite;
        Insert: Partial<LmsCoursePrerequisite> & Pick<LmsCoursePrerequisite, "course_id" | "prerequisite_course_id" | "organization_id">;
        Update: Partial<LmsCoursePrerequisite>;
        Relationships: [];
      };
      lms_course_instructors: {
        Row: LmsCourseInstructor;
        Insert: Partial<LmsCourseInstructor> & Pick<LmsCourseInstructor, "course_id" | "organization_id" | "member_id">;
        Update: Partial<LmsCourseInstructor>;
        Relationships: [];
      };
      lms_modules: {
        Row: LmsModule;
        Insert: Partial<LmsModule> & Pick<LmsModule, "course_id" | "organization_id" | "title">;
        Update: Partial<LmsModule>;
        Relationships: [];
      };
      lms_lessons: {
        Row: LmsLesson;
        Insert: Partial<LmsLesson> & Pick<LmsLesson, "module_id" | "course_id" | "organization_id" | "title">;
        Update: Partial<LmsLesson>;
        Relationships: [];
      };
      lms_enrollments: {
        Row: LmsEnrollment;
        Insert: Partial<LmsEnrollment> & Pick<LmsEnrollment, "organization_id" | "course_id" | "member_id">;
        Update: Partial<LmsEnrollment>;
        Relationships: [];
      };
      lms_lesson_progress: {
        Row: LmsLessonProgress;
        Insert: Partial<LmsLessonProgress> & Pick<LmsLessonProgress, "organization_id" | "enrollment_id" | "lesson_id" | "member_id">;
        Update: Partial<LmsLessonProgress>;
        Relationships: [];
      };
      lms_quizzes: {
        Row: LmsQuiz;
        Insert: Partial<LmsQuiz> & Pick<LmsQuiz, "lesson_id" | "organization_id" | "course_id">;
        Update: Partial<LmsQuiz>;
        Relationships: [];
      };
      lms_quiz_questions: {
        Row: LmsQuizQuestion;
        Insert: Partial<LmsQuizQuestion> & Pick<LmsQuizQuestion, "lesson_id" | "organization_id" | "kind" | "prompt">;
        Update: Partial<LmsQuizQuestion>;
        Relationships: [];
      };
      lms_quiz_attempts: {
        Row: LmsQuizAttempt;
        Insert: Partial<LmsQuizAttempt> & Pick<LmsQuizAttempt, "organization_id" | "lesson_id" | "course_id" | "enrollment_id" | "member_id" | "attempt_number">;
        Update: Partial<LmsQuizAttempt>;
        Relationships: [];
      };
      church_groups: {
        Row: ChurchGroup;
        Insert: Partial<ChurchGroup> & Pick<ChurchGroup, "organization_id" | "name">;
        Update: Partial<ChurchGroup>;
        Relationships: [];
      };
      church_group_members: {
        Row: ChurchGroupMember;
        Insert: Partial<ChurchGroupMember> & Pick<ChurchGroupMember, "group_id" | "organization_id">;
        Update: Partial<ChurchGroupMember>;
        Relationships: [];
      };
      church_group_messages: {
        Row: ChurchGroupMessage;
        Insert: Partial<ChurchGroupMessage> & Pick<ChurchGroupMessage, "group_id" | "organization_id" | "sender_name">;
        Update: Partial<ChurchGroupMessage>;
        Relationships: [];
      };
      platform_service_users: {
        Row: PlatformServiceUser;
        Insert: Partial<PlatformServiceUser> & Pick<PlatformServiceUser, "auth_user_id" | "email">;
        Update: Partial<PlatformServiceUser>;
        Relationships: [];
      };
      lms_assignments: {
        Row: LmsAssignment;
        Insert: Partial<LmsAssignment> & Pick<LmsAssignment, "lesson_id" | "organization_id" | "course_id">;
        Update: Partial<LmsAssignment>;
        Relationships: [];
      };
      lms_assignment_submissions: {
        Row: LmsAssignmentSubmission;
        Insert: Partial<LmsAssignmentSubmission> & Pick<LmsAssignmentSubmission, "organization_id" | "lesson_id" | "course_id" | "enrollment_id" | "member_id">;
        Update: Partial<LmsAssignmentSubmission>;
        Relationships: [];
      };
      lms_certificates: {
        Row: LmsCertificate;
        Insert: Partial<LmsCertificate> & Pick<LmsCertificate, "organization_id" | "member_id" | "code" | "student_name" | "title" | "organization_name">;
        Update: Partial<LmsCertificate>;
        Relationships: [];
      };
      change_tickets: {
        Row: ChangeTicket;
        Insert: Partial<ChangeTicket> & Pick<ChangeTicket, "title">;
        Update: Partial<ChangeTicket>;
        Relationships: [];
      };
      change_ticket_comments: {
        Row: ChangeTicketComment;
        Insert: Partial<ChangeTicketComment> & Pick<ChangeTicketComment, "ticket_id" | "author" | "body">;
        Update: Partial<ChangeTicketComment>;
        Relationships: [];
      };
      lms_program_enrollments: {
        Row: LmsProgramEnrollment;
        Insert: Partial<LmsProgramEnrollment> & Pick<LmsProgramEnrollment, "organization_id" | "program_id" | "member_id">;
        Update: Partial<LmsProgramEnrollment>;
        Relationships: [];
      };
      lms_payment_orders: {
        Row: LmsPaymentOrder;
        Insert: Partial<LmsPaymentOrder> & Pick<LmsPaymentOrder, "organization_id" | "amount" | "payu_txnid" | "payer_name">;
        Update: Partial<LmsPaymentOrder>;
        Relationships: [];
      };
      course_payouts: {
        Row: CoursePayout;
        Insert: Partial<CoursePayout> & Pick<CoursePayout, "organization_id" | "amount">;
        Update: Partial<CoursePayout>;
        Relationships: [];
      };
      course_payout_requests: {
        Row: CoursePayoutRequest;
        Insert: Partial<CoursePayoutRequest> & Pick<CoursePayoutRequest, "organization_id" | "amount" | "payout_method">;
        Update: Partial<CoursePayoutRequest>;
        Relationships: [];
      };
      giving_payouts: {
        Row: GivingPayout;
        Insert: Partial<GivingPayout> & Pick<GivingPayout, "organization_id" | "amount">;
        Update: Partial<GivingPayout>;
        Relationships: [];
      };
      giving_payout_requests: {
        Row: GivingPayoutRequest;
        Insert: Partial<GivingPayoutRequest> & Pick<GivingPayoutRequest, "organization_id" | "amount" | "payout_method">;
        Update: Partial<GivingPayoutRequest>;
        Relationships: [];
      };
      lms_student_applications: {
        Row: LmsStudentApplication;
        Insert: Partial<LmsStudentApplication> & Pick<LmsStudentApplication, "organization_id" | "first_name" | "last_name" | "phone">;
        Update: Partial<LmsStudentApplication>;
        Relationships: [];
      };
      lms_live_sessions: {
        Row: LmsLiveSession;
        Insert: Partial<LmsLiveSession> & Pick<LmsLiveSession, "organization_id" | "course_id" | "title" | "starts_at" | "ends_at">;
        Update: Partial<LmsLiveSession>;
        Relationships: [];
      };
      lms_session_attendance: {
        Row: LmsSessionAttendance;
        Insert: Partial<LmsSessionAttendance> & Pick<LmsSessionAttendance, "session_id" | "member_id" | "organization_id">;
        Update: Partial<LmsSessionAttendance>;
        Relationships: [];
      };
      lms_audit_events: {
        Row: LmsAuditEvent;
        Insert: Partial<LmsAuditEvent> & Pick<LmsAuditEvent, "organization_id" | "action" | "entity_type">;
        Update: Partial<LmsAuditEvent>;
        Relationships: [];
      };
      app_popups: {
        Row: AppPopup;
        Insert: Partial<AppPopup> & Pick<AppPopup, "organization_id" | "title">;
        Update: Partial<AppPopup>;
        Relationships: [];
      };
      scheduled_campaigns: {
        Row: ScheduledCampaign;
        Insert: Partial<ScheduledCampaign> & Pick<ScheduledCampaign, "organization_id" | "channel" | "scheduled_at" | "payload">;
        Update: Partial<ScheduledCampaign>;
        Relationships: [];
      };
      whatsapp_notice_log: {
        Row: WhatsAppNotice;
        Insert: Partial<WhatsAppNotice> & Pick<WhatsAppNotice, "organization_id" | "kind" | "ref_id" | "recipient">;
        Update: Partial<WhatsAppNotice>;
        Relationships: [];
      };
      live_stream_viewers: {
        Row: LiveStreamViewer;
        Insert: Partial<LiveStreamViewer> & Pick<LiveStreamViewer, "stream_id" | "viewer_id">;
        Update: Partial<LiveStreamViewer>;
        Relationships: [];
      };
      live_stream_messages: {
        Row: LiveStreamMessage;
        Insert: Partial<LiveStreamMessage> & Pick<LiveStreamMessage, "stream_id" | "organization_id" | "author_name" | "body">;
        Update: Partial<LiveStreamMessage>;
        Relationships: [];
      };
      kmeet_entry_requests: {
        Row: KmeetEntryRequest;
        Insert: Partial<KmeetEntryRequest> & Pick<KmeetEntryRequest, "meeting_id" | "user_id" | "name">;
        Update: Partial<KmeetEntryRequest>;
        Relationships: [];
      };
      kmeet_meetings: {
        Row: KmeetMeeting;
        Insert: Partial<KmeetMeeting> & Pick<KmeetMeeting, "organization_id" | "title">;
        Update: Partial<KmeetMeeting>;
        Relationships: [
          {
            foreignKeyName: "kmeet_meetings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kmeet_meetings_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "kmeet_meetings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      device_push_tokens: {
        Row: DevicePushToken;
        Insert: Partial<DevicePushToken> & Pick<DevicePushToken, "auth_user_id" | "token" | "platform">;
        Update: Partial<DevicePushToken>;
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_auth_user_id_fkey";
            columns: ["auth_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: Partial<NotificationPreferences> & Pick<NotificationPreferences, "auth_user_id">;
        Update: Partial<NotificationPreferences>;
        Relationships: [
          {
            foreignKeyName: "notification_preferences_auth_user_id_fkey";
            columns: ["auth_user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      instagram_connections: {
        Row: InstagramConnection;
        Insert: Partial<InstagramConnection> &
          Pick<InstagramConnection, "organization_id" | "instagram_user_id" | "username" | "access_token" | "token_expires_at">;
        Update: Partial<InstagramConnection>;
        Relationships: [
          {
            foreignKeyName: "instagram_connections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_conversation_reads: {
        Row: InstagramConversationRead;
        Insert: Partial<InstagramConversationRead> & Pick<InstagramConversationRead, "organization_id" | "conversation_id">;
        Update: Partial<InstagramConversationRead>;
        Relationships: [
          {
            foreignKeyName: "instagram_conversation_reads_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_ai_mode: {
        Row: InstagramAiMode;
        Insert: Partial<InstagramAiMode> & Pick<InstagramAiMode, "organization_id" | "participant_id">;
        Update: Partial<InstagramAiMode>;
        Relationships: [
          {
            foreignKeyName: "instagram_ai_mode_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_ai_mode: {
        Row: WhatsAppAiMode;
        Insert: Partial<WhatsAppAiMode> & Pick<WhatsAppAiMode, "organization_id" | "phone_number">;
        Update: Partial<WhatsAppAiMode>;
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_mode_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_data_access_rules: {
        Row: AiDataAccessRules;
        Insert: Partial<AiDataAccessRules> & Pick<AiDataAccessRules, "organization_id">;
        Update: Partial<AiDataAccessRules>;
        Relationships: [
          {
            foreignKeyName: "ai_data_access_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      instagram_comment_automations: {
        Row: InstagramCommentAutomation;
        Insert: Partial<InstagramCommentAutomation> & Pick<InstagramCommentAutomation, "organization_id" | "reply_template">;
        Update: Partial<InstagramCommentAutomation>;
        Relationships: [
          {
            foreignKeyName: "instagram_comment_automations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instagram_comment_automations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      instagram_comment_replies: {
        Row: InstagramCommentReply;
        Insert: Partial<InstagramCommentReply> & Pick<InstagramCommentReply, "organization_id" | "comment_id">;
        Update: Partial<InstagramCommentReply>;
        Relationships: [
          {
            foreignKeyName: "instagram_comment_replies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "instagram_comment_replies_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "instagram_comment_automations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_reply_usage: {
        Row: AiReplyUsage;
        Insert: Partial<AiReplyUsage> & Pick<AiReplyUsage, "organization_id">;
        Update: Partial<AiReplyUsage>;
        Relationships: [
          {
            foreignKeyName: "ai_reply_usage_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      aura_messages: {
        Row: AuraMessage;
        Insert: Partial<AuraMessage> & Pick<AuraMessage, "organization_id" | "auth_user_id" | "role" | "content">;
        Update: Partial<AuraMessage>;
        Relationships: [
          {
            foreignKeyName: "aura_messages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      youtube_connections: {
        Row: YouTubeConnection;
        Insert: Partial<YouTubeConnection> &
          Pick<
            YouTubeConnection,
            "organization_id" | "channel_id" | "channel_title" | "access_token" | "refresh_token" | "token_expires_at"
          >;
        Update: Partial<YouTubeConnection>;
        Relationships: [
          {
            foreignKeyName: "youtube_connections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      facebook_connections: {
        Row: FacebookConnection;
        Insert: Partial<FacebookConnection> &
          Pick<FacebookConnection, "organization_id" | "page_id" | "page_name" | "access_token">;
        Update: Partial<FacebookConnection>;
        Relationships: [
          {
            foreignKeyName: "facebook_connections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      email_campaigns: {
        Row: EmailCampaign;
        Insert: Partial<EmailCampaign> &
          Pick<EmailCampaign, "organization_id" | "subject" | "body_html" | "status">;
        Update: Partial<EmailCampaign>;
        Relationships: [
          {
            foreignKeyName: "email_campaigns_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_campaigns_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      sms_campaigns: {
        Row: SmsCampaign;
        Insert: Partial<SmsCampaign> & Pick<SmsCampaign, "organization_id" | "body" | "status">;
        Update: Partial<SmsCampaign>;
        Relationships: [
          {
            foreignKeyName: "sms_campaigns_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sms_campaigns_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      organization_whatsapp_accounts: {
        Row: OrganizationWhatsAppAccount;
        Insert: Partial<OrganizationWhatsAppAccount> &
          Pick<OrganizationWhatsAppAccount, "organization_id" | "account_sid" | "auth_token" | "whatsapp_number">;
        Update: Partial<OrganizationWhatsAppAccount>;
        Relationships: [
          {
            foreignKeyName: "organization_whatsapp_accounts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_campaigns: {
        Row: WhatsAppCampaign;
        Insert: Partial<WhatsAppCampaign> & Pick<WhatsAppCampaign, "organization_id" | "body" | "status">;
        Update: Partial<WhatsAppCampaign>;
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaigns_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_campaigns_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
          {
            foreignKeyName: "whatsapp_campaigns_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_templates: {
        Row: WhatsAppTemplate;
        Insert: Partial<WhatsAppTemplate> & Pick<WhatsAppTemplate, "organization_id" | "name" | "category" | "body_text">;
        Update: Partial<WhatsAppTemplate>;
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_conversations: {
        Row: WhatsAppConversation;
        Insert: Partial<WhatsAppConversation> & Pick<WhatsAppConversation, "organization_id" | "phone_number">;
        Update: Partial<WhatsAppConversation>;
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_messages: {
        Row: WhatsAppMessage;
        Insert: Partial<WhatsAppMessage> & Pick<WhatsAppMessage, "conversation_id" | "organization_id" | "direction" | "body">;
        Update: Partial<WhatsAppMessage>;
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      website_widgets: {
        Row: WebsiteWidget;
        Insert: Partial<WebsiteWidget> & Pick<WebsiteWidget, "organization_id">;
        Update: Partial<WebsiteWidget>;
        Relationships: [
          {
            foreignKeyName: "website_widgets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      widget_submissions: {
        Row: WidgetSubmission;
        Insert: Partial<WidgetSubmission> & Pick<WidgetSubmission, "widget_id" | "organization_id">;
        Update: Partial<WidgetSubmission>;
        Relationships: [
          {
            foreignKeyName: "widget_submissions_widget_id_fkey";
            columns: ["widget_id"];
            isOneToOne: false;
            referencedRelation: "website_widgets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "widget_submissions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      email_smtp_settings: {
        Row: EmailSmtpSettings;
        Insert: Partial<EmailSmtpSettings> &
          Pick<EmailSmtpSettings, "organization_id" | "host" | "port" | "username" | "password" | "from_email">;
        Update: Partial<EmailSmtpSettings>;
        Relationships: [
          {
            foreignKeyName: "email_smtp_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      email_setup_requests: {
        Row: EmailSetupRequest;
        Insert: Partial<EmailSetupRequest> & Pick<EmailSetupRequest, "organization_id">;
        Update: Partial<EmailSetupRequest>;
        Relationships: [
          {
            foreignKeyName: "email_setup_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_setup_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["auth_user_id"];
          },
        ];
      };
      automation_templates: {
        Row: AutomationTemplate;
        Insert: Partial<AutomationTemplate> & Pick<AutomationTemplate, "organization_id" | "meta_template_name" | "category" | "body_text_named" | "kind">;
        Update: Partial<AutomationTemplate>;
        Relationships: [
          {
            foreignKeyName: "automation_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      automations: {
        Row: Automation;
        Insert: Partial<Automation> & Pick<Automation, "organization_id" | "name">;
        Update: Partial<Automation>;
        Relationships: [
          {
            foreignKeyName: "automations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_runs: {
        Row: AutomationRun;
        Insert: Partial<AutomationRun> & Pick<AutomationRun, "organization_id" | "automation_id" | "run_key">;
        Update: Partial<AutomationRun>;
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_run_items: {
        Row: AutomationRunItem;
        Insert: Partial<AutomationRunItem> & Pick<AutomationRunItem, "run_id" | "organization_id" | "outcome">;
        Update: Partial<AutomationRunItem>;
        Relationships: [
          {
            foreignKeyName: "automation_run_items_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "automation_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_triggers: {
        Row: AutomationTrigger;
        Insert: Partial<AutomationTrigger> & Pick<AutomationTrigger, "automation_id" | "organization_id" | "date_field_source" | "occasion_label">;
        Update: Partial<AutomationTrigger>;
        Relationships: [
          {
            foreignKeyName: "automation_triggers_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_triggers_date_field_id_fkey";
            columns: ["date_field_id"];
            isOneToOne: false;
            referencedRelation: "member_field_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_triggers_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "automation_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_destinations: {
        Row: AutomationDestination;
        Insert: Partial<AutomationDestination> & Pick<AutomationDestination, "automation_id" | "organization_id" | "kind">;
        Update: Partial<AutomationDestination>;
        Relationships: [
          {
            foreignKeyName: "automation_destinations_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_destinations_digest_template_id_fkey";
            columns: ["digest_template_id"];
            isOneToOne: false;
            referencedRelation: "automation_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_executions: {
        Row: AutomationExecution;
        Insert: Partial<AutomationExecution> & Pick<AutomationExecution, "organization_id" | "automation_id" | "destination_kind" | "idempotency_key" | "status">;
        Update: Partial<AutomationExecution>;
        Relationships: [
          {
            foreignKeyName: "automation_executions_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_executions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: {
        Args: {
          org_name: string;
          org_slug: string;
          member_count_range?: string | null;
          branch_count?: number | null;
          member_title?: string | null;
        };
        Returns: Organization;
      };
      accept_invitation: {
        Args: { invite_token: string };
        Returns: Organization;
      };
      get_invitation_preview: {
        Args: { invite_token: string };
        Returns: {
          organization_name: string;
          email: string;
          status: InvitationStatus;
          expires_at: string;
        }[];
      };
      get_public_join_form: {
        Args: { org_slug: string };
        Returns: {
          organization_id: string;
          organization_name: string;
          organization_logo_url: string | null;
          field_definitions: PublicFieldDefinition[];
          branches: { id: string; name: string }[];
        }[];
      };
      submit_member_request: {
        Args: {
          org_slug: string;
          first_name: string;
          last_name: string;
          phone: string;
          branch_id: string | null;
          date_of_birth: string;
          marital_status: string;
          email?: string | null;
          wedding_date?: string | null;
          custom_fields?: Record<string, unknown> | null;
        };
        Returns: string;
      };
      get_shared_worship_document: {
        Args: { token: string };
        Returns: { title: string; file_path: string; file_type: string }[];
      };
      lms_lesson_file_access: {
        Args: { p_lesson: string };
        Returns: string | null;
      };
      lms_approve_application: {
        Args: { p_org: string; p_application: string; p_course: string | null; p_actor: string | null; p_program?: string | null };
        Returns: { member_id: string; enrolled: boolean };
      };
      lms_create_enrollment: {
        Args: { p_organization_id: string; p_course_id: string; p_member_id: string; p_status: string; p_source: string; p_actor: string | null; p_ignore_window?: boolean };
        Returns: string;
      };
      lms_enroll_program: {
        Args: { p_organization_id: string; p_program_id: string; p_member_id: string; p_status: string; p_source: string; p_actor: string | null };
        Returns: string;
      };
      lms_decide_program_enrollment: {
        Args: { p_organization_id: string; p_enrollment_id: string; p_action: string; p_actor: string };
        Returns: string;
      };
      lms_program_sync_courses: {
        Args: { p_program_enrollment: string };
        Returns: number;
      };
      lms_verify_certificate: {
        Args: { p_code: string };
        Returns: { code: string; student_name: string; title: string; kind: string; organization_name: string; percent: number | null; issued_at: string; revoked: boolean }[];
      };
      lms_grade_attempt: {
        Args: { p_org: string; p_attempt: string; p_points: Record<string, number>; p_feedback: string; p_actor: string };
        Returns: { percent: number; passed: boolean };
      };
      lms_grade_assignment: {
        Args: { p_org: string; p_submission: string; p_score: number; p_feedback: string; p_actor: string };
        Returns: { member_id: string; lesson_id: string; score: number; max_points: number };
      };
      lms_get_assignment: {
        Args: { p_lesson: string };
        Returns: Record<string, unknown>;
      };
      lms_assignment_upload_slot: {
        Args: { p_lesson: string };
        Returns: { organization_id: string; member_id: string };
      };
      lms_submit_assignment: {
        Args: { p_lesson: string; p_text: string | null; p_file_path: string | null; p_file_name: string | null; p_file_size: number | null };
        Returns: { late: boolean; replaced_file: string | null; organization_id: string; course_id: string; member_id: string };
      };
      lms_my_submission_file: {
        Args: { p_lesson: string };
        Returns: { file_path: string; file_name: string }[];
      };
      lms_decide_enrollment: {
        Args: { p_organization_id: string; p_enrollment_id: string; p_action: string; p_actor: string };
        Returns: string;
      };
      lms_move_module: {
        Args: { p_organization_id: string; p_module_id: string; p_direction: number };
        Returns: undefined;
      };
      lms_move_lesson: {
        Args: { p_organization_id: string; p_lesson_id: string; p_direction: number };
        Returns: undefined;
      };
      next_invoice_number: {
        Args: { p_fy: string };
        Returns: number;
      };
      verify_volunteer: {
        Args: { token: string };
        Returns: {
          volunteer_no: string;
          first_name: string;
          last_name: string;
          role: string;
          team: string | null;
          status: string;
          organization_name: string;
          logo_url: string | null;
          verified: boolean;
        }[];
      };
      get_shared_document: {
        Args: { token: string };
        Returns: { title: string; file_path: string; file_type: string }[];
      };
      get_church_giving: {
        Args: { token: string };
        Returns: {
          organization_id: string;
          organization_name: string;
          organization_logo_url: string | null;
          giving_mode: FundraiserPaymentMode | null;
          giving_types: string[];
        }[];
      };
      get_shared_fundraiser: {
        Args: { token: string };
        Returns: {
          id: string;
          organization_id: string;
          organization_name: string;
          organization_logo_url: string | null;
          title: string;
          description: string | null;
          goal_amount: number;
          raised_amount: number;
          payment_mode: FundraiserPaymentMode | null;
        }[];
      };
      get_shared_category: {
        Args: { token: string };
        Returns: { id: string; name: string; organization_name: string; organization_logo_url: string | null }[];
      };
      get_shared_category_documents: {
        Args: { token: string };
        Returns: { id: string; title: string; file_type: string; file_size: number; created_at: string }[];
      };
      get_shared_category_document: {
        Args: { token: string; doc_id: string };
        Returns: { title: string; file_path: string; file_type: string }[];
      };
      delete_instagram_connection_by_ig_user: {
        Args: { ig_user_id: string };
        Returns: undefined;
      };
      backfill_member_custom_field: {
        Args: { p_organization_id: string; p_key: string; p_value: unknown };
        Returns: undefined;
      };
      sync_youth_for_org: {
        Args: { target_org_id: string };
        Returns: { added: number; removed: number }[];
      };
      get_organization_storage_bytes: {
        Args: { target_org_id: string };
        Returns: number;
      };
      get_tenant_storage_bytes: {
        Args: { target_org_id: string };
        Returns: number;
      };
      get_platform_storage_stats: {
        Args: Record<string, never>;
        Returns: { file_storage_bytes: number; database_bytes: number }[];
      };
      get_active_sessions: {
        Args: Record<string, never>;
        Returns: {
          session_id: string;
          user_id: string;
          user_email: string | null;
          user_phone: string | null;
          member_name: string | null;
          organization_names: string[];
          created_at: string;
          updated_at: string;
          not_after: string | null;
          user_agent: string | null;
          ip: string | null;
        }[];
      };
      member_has_phone: {
        Args: { p_org: string; p_key: string };
        Returns: boolean;
      };
      admin_revoke_session: {
        Args: { target_session_id: string };
        Returns: undefined;
      };
      get_public_form: {
        Args: { form_slug: string };
        Returns: {
          form_id: string;
          title: string;
          description: string | null;
          fields: FormField[];
          organization_name: string;
          organization_logo_url: string | null;
        }[];
      };
      submit_form_response: {
        Args: { form_slug: string; answers: Record<string, unknown> };
        Returns: string;
      };
      get_public_widget: {
        Args: { token: string };
        Returns: {
          widget_id: string;
          primary_color: string;
          position: WidgetPosition;
          button_label: string;
          greeting_title: string;
          greeting_message: string;
          fields: FormField[];
        }[];
      };
      submit_widget_response: {
        Args: { token: string; answers: Record<string, unknown>; page_url?: string | null };
        Returns: string;
      };
      get_public_event_registration: {
        Args: { token: string };
        Returns: {
          event_id: string;
          title: string;
          description: string | null;
          start_at: string;
          end_at: string | null;
          registration_fields: EventRegistrationField[];
          registration_closes_at: string | null;
          spots_remaining: number | null;
          is_open: boolean;
          status: EventStatus;
          organization_name: string;
          organization_logo_url: string | null;
          organization_timezone: string;
        }[];
      };
      activate_automation_within_limit: {
        Args: { p_org: string; p_automation: string; p_limit: number | null };
        Returns: boolean;
      };
      organization_social_accounts: {
        Args: { p_organization_id: string };
        Returns: { platform: string; account_name: string; picture_url: string | null; is_active: boolean }[];
      };
      submit_event_registration: {
        Args: { token: string; answers: Record<string, unknown> };
        Returns: { registration_id: string; confirmation_code: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type CronJobRun = {
  id: string;
  job_key: string;
  trigger: "schedule" | "manual";
  triggered_by_email: string | null;
  status: "running" | "success" | "error";
  http_status: number | null;
  summary: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

export type MemberHomeLayoutRow = {
  id: string;
  organization_id: string;
  status: "draft" | "published";
  layout: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
};

export type OrganizationWhatsAppConnection = {
  id: string;
  organization_id: string;
  connection_method: "manual" | "embedded_signup";
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  access_token_encrypted: string;
  app_secret_encrypted: string | null;
  webhook_verify_token: string;
  status: "active" | "error" | "disconnected";
  last_error: string | null;
  last_checked_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformWhatsAppTemplate = {
  id: string;
  catalog_key: string;
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  body_text: string;
  variable_count: number;
  meta_template_id: string | null;
  status: WhatsAppTemplateStatus;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PrayerRequestVisibility = "private" | "shared";
export type PrayerRequestStatus = "open" | "answered";

export type PrayerRequest = {
  id: string;
  organization_id: string;
  member_id: string;
  request: string;
  visibility: PrayerRequestVisibility;
  is_anonymous: boolean;
  status: PrayerRequestStatus;
  answered_at: string | null;
  audio_path: string | null;
  audio_seconds: number | null;
  created_at: string;
  updated_at: string;
};

// A group a team creates inside To Do to keep a set of tasks together.
export type TodoEvent = {
  id: string;
  organization_id: string;
  title: string;
  event_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppMessageKind = "campaign" | "automation" | "event_pass";

export type WhatsAppMessageLog = {
  id: string;
  organization_id: string;
  kind: WhatsAppMessageKind;
  ref_id: string | null;
  recipient: string;
  wamid: string;
  template_name: string | null;
  category: string | null;
  sender_key: string;
  status: string;
  error_code: string | null;
  credited_back: boolean;
  body_text: string | null;
  fallback_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WhatsAppContactHealth = {
  sender_key: string;
  recipient: string;
  marketing_blocked_until: string | null;
  consecutive_failures: number;
  last_error_code: string | null;
  updated_at: string;
};

export type AccountDeletionStatus = "pending" | "completed" | "rejected";

export type AccountDeletionRequest = {
  id: string;
  auth_user_id: string;
  organization_id: string | null;
  requester_kind: "member" | "team" | "owner";
  member_id: string | null;
  display_name: string;
  contact: string | null;
  reason: string | null;
  status: AccountDeletionStatus;
  outcome: string | null;
  processed_note: string | null;
  processed_by: string | null;
  processed_at: string | null;
  requested_at: string;
};

export type GroupPost = {
  id: string;
  organization_id: string;
  group_key: "leaders" | "youth" | "worship" | "media" | "committee";
  title: string;
  body: string | null;
  link_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PushBroadcast = {
  id: string;
  organization_id: string;
  audience: "church" | "branch" | "group" | "member";
  group_key: GroupPost["group_key"] | null;
  branch_id: string | null;
  member_id: string | null;
  title: string;
  body: string;
  link_url: string | null;
  button_label: string | null;
  recipient_count: number;
  created_by: string | null;
  created_at: string;
};

export type SpecialDayPush = {
  member_id: string;
  kind: "birthday" | "anniversary";
  year: number;
  sent_at: string;
};
