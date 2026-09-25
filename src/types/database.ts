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
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  logo_url: string | null;
  member_count_range: MemberCountRange | null;
  branch_count: number | null;
  plan: string;
  // ISO 3166-1 alpha-2 (e.g. "US") — the default country code for
  // resolving members' phone numbers when their branch has none set.
  country: string | null;
  // Basic-tier access without a subscription until this passes — see
  // getPlanAccess in src/lib/plans/dal.ts.
  trial_ends_at: string | null;
  // Add-on pack balances (see plans/config.ts ADDON_PACKS) — running
  // totals topped up by organization_addon_orders, never auto-reset.
  addon_sms_credits: number;
  addon_email_credits: number;
  addon_whatsapp_credits: number;
  addon_storage_bytes: number;
  created_at: string;
  updated_at: string;
};

export type AddonOrderStatus = "created" | "paid";

export type OrganizationAddonOrder = {
  id: string;
  organization_id: string;
  addon_type: "sms" | "email" | "whatsapp" | "storage";
  pack_id: string;
  credits: number;
  amount: number;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
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
  created_at: string;
  updated_at: string;
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
export type MemberStatus = "active" | "left" | "pending";
export type MaritalStatus = "married" | "unmarried";

export type Member = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: MemberStatus;
  branch_id: string | null;
  date_of_birth: string | null;
  marital_status: MaritalStatus | null;
  wedding_date: string | null;
  custom_fields: Record<string, CustomFieldValue>;
  created_by: string | null;
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
  created_at: string;
  updated_at: string;
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

export type WhatsAppMode = "own" | "shared";

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

export type WhatsAppCampaignStatus = "sent" | "partial_failure" | "failed";

export type WhatsAppCampaign = {
  id: string;
  organization_id: string;
  mode: WhatsAppMode;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  failed_recipients: { phone: string; error: string }[];
  status: WhatsAppCampaignStatus;
  sent_by: string | null;
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

export type Todo = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: TodoStatus;
  assigned_to: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type EventMeetingMode = "offline" | "online";

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
  managed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceSession = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  event_id: string | null;
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

export type FundraiserPaymentOrderStatus = "created" | "paid" | "failed";

export type FundraiserPaymentOrder = {
  id: string;
  organization_id: string;
  fundraiser_id: string;
  razorpay_order_id: string;
  amount: number;
  payment_mode: FundraiserPaymentMode;
  status: FundraiserPaymentOrderStatus;
  razorpay_payment_id: string | null;
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

export type NotificationType =
  | "member_request"
  | "youtube_video_uploaded"
  | "youtube_video_updated"
  | "youtube_live_started"
  | "facebook_post_created"
  | "facebook_post_updated"
  | "support_ticket_reply";

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
      organization_addon_orders: {
        Row: OrganizationAddonOrder;
        Insert: Partial<OrganizationAddonOrder> &
          Pick<OrganizationAddonOrder, "organization_id" | "addon_type" | "pack_id" | "credits" | "amount" | "razorpay_order_id">;
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
      fundraiser_payment_orders: {
        Row: FundraiserPaymentOrder;
        Insert: Partial<FundraiserPaymentOrder> &
          Pick<FundraiserPaymentOrder, "organization_id" | "fundraiser_id" | "razorpay_order_id" | "amount" | "payment_mode" | "donor_name">;
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
        Insert: Partial<WhatsAppCampaign> & Pick<WhatsAppCampaign, "organization_id" | "mode" | "body" | "status">;
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
      get_shared_document: {
        Args: { token: string };
        Returns: { title: string; file_path: string; file_type: string }[];
      };
      get_shared_fundraiser: {
        Args: { token: string };
        Returns: {
          id: string;
          organization_id: string;
          organization_name: string;
          title: string;
          description: string | null;
          goal_amount: number;
          raised_amount: number;
          payment_mode: FundraiserPaymentMode | null;
        }[];
      };
      get_shared_category: {
        Args: { token: string };
        Returns: { id: string; name: string }[];
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
      get_organization_storage_bytes: {
        Args: { target_org_id: string };
        Returns: number;
      };
      get_public_form: {
        Args: { form_slug: string };
        Returns: {
          form_id: string;
          title: string;
          description: string | null;
          fields: FormField[];
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
