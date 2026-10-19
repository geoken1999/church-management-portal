import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/organizations/dal";
import {
  getCourseOptions,
  getMemberOptions,
  getProgramEnrollments,
  getPrograms,
} from "@/lib/lms/dal";
import { ProgramEnrollmentsPanel } from "@/components/bible-school/ProgramEnrollmentsPanel";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Program | Bible School | KingdomFlow",
};

export const dynamic = "force-dynamic";

// One program: what it costs, which courses it holds, and who is enrolled. Joining and paying happen at
// this level: a student who joins the program is enrolled in every course of it.
export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const membership = await requireOrganization();
  const organizationId = membership.organization.id;
  if (!membership.tabAccess.bibleschool.write) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          Only school administrators can manage program enrollments.
        </CardContent>
      </Card>
    );
  }
  const programs = await getPrograms(organizationId);
  const program = programs.find((p) => p.id === id);
  if (!program) notFound();
  const [rows, members, courses] = await Promise.all([
    getProgramEnrollments(organizationId, id),
    getMemberOptions(organizationId),
    getCourseOptions(organizationId),
  ]);
  const titles = program.courseIds.map(
    (cid) => courses.find((c) => c.id === cid)?.title ?? "Unknown course",
  );

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/bible-school/programs"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Programs
      </Link>
      <div>
        <h2 className="font-heading text-2xl font-bold">{program.title}</h2>
        <p className="text-sm text-muted-foreground">
          {program.price_amount ? `Fee ₹${program.price_amount}` : "Free"}
          {program.capacity ? ` · ${program.capacity} seats` : ""} ·{" "}
          {program.visibility === "public"
            ? "Open to the public"
            : "Church members only"}{" "}
          · {program.status}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {titles.length === 0
            ? "No courses in this program yet."
            : `Courses: ${titles.join(" → ")}`}
        </p>
      </div>
      <ProgramEnrollmentsPanel
        organizationId={organizationId}
        programId={id}
        programOpen={program.status === "published"}
        rows={rows}
        members={members}
      />
    </div>
  );
}
