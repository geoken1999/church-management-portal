import { PortalLesson } from "@/components/bible-school/portal/PortalLesson";

export default async function LearnLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <PortalLesson lessonId={lessonId} />;
}
