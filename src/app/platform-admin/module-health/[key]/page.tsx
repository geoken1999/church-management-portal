import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getModuleHealthReport } from "@/lib/module-health/service";
import { ModuleDetailView } from "@/components/platform-admin/module-health/DetailView";

export const metadata: Metadata = { title: "Module health | KingdomFlow Super Admin" };
export const dynamic = "force-dynamic";

export default async function ModuleDetailPage({ params }: { params: Promise<{ key: string }> }) {
  await requirePlatformAdmin();
  const { key } = await params;
  const report = await getModuleHealthReport();
  return <ModuleDetailView report={report} moduleKey={key} />;
}
