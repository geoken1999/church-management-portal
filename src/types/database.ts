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

export type Member = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: MemberStatus;
  branch_id: string | null;
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

export type NotificationType = "member_request";

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
          email?: string | null;
          custom_fields?: Record<string, unknown> | null;
        };
        Returns: string;
      };
      get_shared_worship_document: {
        Args: { token: string };
        Returns: { title: string; file_path: string; file_type: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
