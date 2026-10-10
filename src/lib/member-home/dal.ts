import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LAYOUT, sanitizeLayout, type HomeLayout } from "@/lib/member-home/schema";

export interface MemberHomeState {
  draft: HomeLayout;
  published: HomeLayout | null;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  hasUnpublishedChanges: boolean;
}

// Callers are the Design Studio page, which has already checked the viewer
// is an owner/admin of this organization.
export async function getMemberHomeState(organizationId: string): Promise<MemberHomeState> {
  const admin = createAdminClient();
  const { data } = await admin.from("member_home_layouts").select("status, layout, updated_at").eq("organization_id", organizationId);

  const published = data?.find((row) => row.status === "published");
  const draft = data?.find((row) => row.status === "draft");
  const publishedLayout = published ? sanitizeLayout(published.layout, organizationId).layout ?? null : null;
  // Until anything is saved, the editor starts from what members already see.
  const draftLayout = (draft ? sanitizeLayout(draft.layout, organizationId).layout : null) ?? publishedLayout ?? DEFAULT_LAYOUT;

  return {
    draft: draftLayout,
    published: publishedLayout,
    publishedAt: published?.updated_at ?? null,
    draftUpdatedAt: draft?.updated_at ?? null,
    hasUnpublishedChanges: JSON.stringify(draftLayout) !== JSON.stringify(publishedLayout ?? DEFAULT_LAYOUT),
  };
}
