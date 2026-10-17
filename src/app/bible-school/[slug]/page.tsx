import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getPublicSchool } from "@/lib/lms/public-school";
import { COURSE_LEVELS, DELIVERY_MODES } from "@/lib/lms/constants";
import { StudentApplyForm } from "@/components/bible-school/StudentApplyForm";
import { AppStoreButtons } from "@/components/landing/AppStoreButtons";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const school = await getPublicSchool(slug);
  return {
    title: school
      ? `${school.schoolName} | KingdomFlow`
      : "Bible School | KingdomFlow",
  };
}

// The public page of a church's Bible School: its public courses, and a form for people outside the
// church to apply. Applications are reviewed by the church's team.
export default async function PublicBibleSchoolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const school = await getPublicSchool(slug);
  if (!school) notFound();

  const label = (
    list: readonly { value: string; label: string }[],
    value: string,
  ) => list.find((i) => i.value === value)?.label ?? value;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <BookOpen className="size-6" />
          </div>
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">
              {school.schoolName}
            </h1>
            {school.tagline && (
              <p className="text-muted-foreground">{school.tagline}</p>
            )}
          </div>
        </div>

        <section className="mt-10 space-y-4">
          <h2 className="font-heading text-xl font-bold">Courses</h2>
          {school.courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No courses are open to the public right now. You can still apply
              below and the church will get in touch.
            </p>
          ) : (
            school.courses.map((course) => (
              <Card key={course.id}>
                <CardContent className="space-y-1">
                  <p className="font-medium">
                    {course.title}
                    {course.code ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {course.code}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {label(COURSE_LEVELS, course.level)} ·{" "}
                    {label(DELIVERY_MODES, course.delivery_mode)}
                    {course.estimated_hours
                      ? ` · ${course.estimated_hours} hours`
                      : ""}
                  </p>
                  {course.description && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {course.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <section className="mt-10 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="font-heading text-xl font-bold">Apply to join</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Tell us who you are. The team at {school.organization.name} reviews
            each application, then you study in the KingdomFlow app.
          </p>
          <StudentApplyForm
            slug={slug}
            courses={school.courses.map((c) => ({ id: c.id, title: c.title }))}
          />
        </section>

        <section className="mt-10 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Get the app to study once you&apos;re approved
          </p>
          <AppStoreButtons />
        </section>
      </main>
    </div>
  );
}
