import type { Metadata } from "next";
import Link from "next/link";
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { slug } = await params;
  const { payment } = await searchParams;
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

        {payment === "success" && (
          <div className="mt-8 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Payment received. Thank you!</p>
            <p className="mt-1 text-muted-foreground">
              You&apos;re enrolled. Sign in with your mobile number to start
              learning, on the web or in the KingdomFlow app.
            </p>
            <Link
              href="/bible-school/learn"
              className="mt-2 inline-block font-medium text-primary underline"
            >
              Open my courses
            </Link>
          </div>
        )}
        {payment === "failed" && (
          <div className="mt-8 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            The payment didn&apos;t go through, so nothing was charged. You can
            apply again below to try once more.
          </div>
        )}

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
                  {course.price_amount ? (
                    <p className="text-sm font-semibold">
                      Course fee: ₹{course.price_amount}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-primary">Free</p>
                  )}
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
            courses={school.courses.map((c) => ({
              id: c.id,
              title: c.title,
              price: c.price_amount,
            }))}
          />
        </section>

        <section className="mt-10 text-center">
          <p className="mb-3 text-sm">
            Already a student?{" "}
            <Link
              href="/bible-school/learn"
              className="font-medium text-primary underline"
            >
              Sign in to your courses
            </Link>
          </p>
          <p className="mb-3 text-sm text-muted-foreground">
            Or get the app to study once you&apos;re approved
          </p>
          <AppStoreButtons />
        </section>
      </main>
    </div>
  );
}
