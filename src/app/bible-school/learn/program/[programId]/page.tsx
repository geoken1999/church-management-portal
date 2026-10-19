import { PortalProgram } from "@/components/bible-school/portal/PortalProgram";

export default async function LearnProgramPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  return <PortalProgram programId={programId} />;
}
