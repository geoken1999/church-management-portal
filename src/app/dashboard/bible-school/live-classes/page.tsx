import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { requireUser } from "@/lib/auth/dal";
import { getSessions, getTaughtCourseIds } from "@/lib/lms/dal";
import { DEFAULT_TIMEZONE } from "@/lib/organizations/timezone";
import { LiveClassesPanel } from "@/components/bible-school/LiveClassesPanel";

export const metadata: Metadata = {
  title: "Live classes | Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

export default async function LiveClassesPage() {
  const membership = await requireOrganization();
  const user = await requireUser();
  const organizationId = membership.organization.id;
  const canManageSchool = membership.tabAccess.bibleschool.write;
  const onlyCourseIds = canManageSchool
    ? undefined
    : await getTaughtCourseIds(organizationId, user.id);
  const sessions = await getSessions(organizationId, { onlyCourseIds });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every live class across your courses. To schedule one, open a course and
        use its <strong>Live classes</strong> tab.
      </p>
      <LiveClassesPanel
        organizationId={organizationId}
        sessions={sessions}
        timeZone={membership.organization.timezone || DEFAULT_TIMEZONE}
        canSchedule={false}
      />
    </div>
  );
}
