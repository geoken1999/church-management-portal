import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth";
import { getModuleHealthReport } from "@/lib/module-health/service";
import { ModuleHealthView } from "@/components/platform-admin/module-health/ListView";

export const metadata: Metadata = { title: "Module health | KingdomFlow Super Admin" };
export const dynamic = "force-dynamic";

export default async function ModuleHealthPage({ searchParams }: { searchParams: Promise<{ refresh?: string }> }) {
  await requirePlatformAdmin();
  const { refresh } = await searchParams;
  const report = await getModuleHealthReport(refresh === "1");
  return <ModuleHealthView report={report} />;
}
