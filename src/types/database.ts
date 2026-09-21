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
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  auth_user_id: string;
  role: OrganizationRole;
  title: string | null;
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

export type Branch = {
  id: string;
  organization_id: string;
  name: string;
  location: string | null;
  member_count: number | null;
  leader_name: string | null;
  leader_phone: string | null;
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

export type NotificationType =
  | "member_request"
  | "youtube_video_uploaded"
  | "youtube_video_updated"
  | "youtube_live_started"
  | "facebook_post_created"
  | "facebook_post_updated";

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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
