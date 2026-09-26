import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import { getAttendanceSession, getAttendanceRoster, getAttendanceRecords } from "@/lib/attendance/dal";
import { getEventRegistrations } from "@/lib/events/registration-dal";
import { AttendanceSessionDetail } from "@/components/attendance/AttendanceSessionDetail";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export async function generateMetadata({ params }: { params: Promise<{ sessionId: string }> }): Promise<Metadata> {
  const { sessionId } = await params;
  const membership = await requireOrganization();
  const session = await getAttendanceSession(membership.organization.id, sessionId);
  return { title: session ? `${session.title} | KingdomFlow` : "Attendance | KingdomFlow" };
}

export default async function AttendanceSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.attendance.read) {
    return <AccessRestricted label="Attendance" />;
  }

  const session = await getAttendanceSession(organizationId, sessionId);
  if (!session) {
    notFound();
  }

  const [roster, presentMemberIds, directory, eventRegistrations] = await Promise.all([
    getAttendanceRoster(organizationId, session.branch_id),
    getAttendanceRecords(sessionId),
    // Only needed as a distinct fetch for branch-scoped sessions — an
    // org-wide session's roster already IS the full directory, so the
    // manual "check in someone not listed" search can reuse it directly.
    session.branch_id ? getAttendanceRoster(organizationId, null) : Promise.resolve(null),
    // Only the linked event's own online registrants — not every Member —
    // and only when that event actually has registration turned on.
    session.events?.registration_enabled && session.event_id
      ? getEventRegistrations(session.event_id).then((rows) => rows.filter((row) => row.status !== "cancelled"))
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{session.title}</h1>
        <p className="mt-1 text-muted-foreground">Check off who was present, or record a total headcount.</p>
      </div>

      <AttendanceSessionDetail
        session={session}
        roster={roster}
        directory={directory ?? roster}
        presentMemberIds={presentMemberIds}
        eventRegistrations={eventRegistrations}
        canWrite={membership.tabAccess.attendance.write}
      />
    </div>
  );
}
