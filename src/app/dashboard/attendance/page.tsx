import type { Metadata } from "next";
import { requireOrganization } from "@/lib/organizations/dal";
import { getAttendanceSessions } from "@/lib/attendance/dal";
import { getBranches } from "@/lib/branches/dal";
import { getEvents } from "@/lib/events/dal";
import { AttendanceManager } from "@/components/attendance/AttendanceManager";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";

export const metadata: Metadata = {
  title: "Attendance | KingdomFlow",
};

export default async function AttendancePage() {
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;

  if (!membership.tabAccess.attendance.read) {
    return <AccessRestricted label="Attendance" />;
  }

  const [sessions, branches, events] = await Promise.all([
    getAttendanceSessions(organizationId),
    getBranches(organizationId),
    getEvents(organizationId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Attendance</h1>
        <p className="mt-1 text-muted-foreground">Take attendance by branch, and link a session to a calendar event when it&apos;s for one.</p>
      </div>

      <AttendanceManager
        organizationId={organizationId}
        sessions={sessions}
        branches={branches}
        events={events}
        canWrite={membership.tabAccess.attendance.write}
        canDelete={membership.tabAccess.attendance.delete}
      />
    </div>
  );
}
