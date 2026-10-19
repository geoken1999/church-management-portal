import { PortalCourse } from "@/components/bible-school/portal/PortalCourse";

export default async function LearnCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <PortalCourse courseId={courseId} />;
}
