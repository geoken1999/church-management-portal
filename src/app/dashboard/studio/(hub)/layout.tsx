import type { ReactNode } from "react";
import { requireStudio } from "@/lib/designer/guard";
import { StudioNav } from "@/components/designer/StudioNav";

export default async function StudioHubLayout({ children }: { children: ReactNode }) {
  const { membership } = await requireStudio();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Design Studio</h1>
        <p className="mt-1 text-muted-foreground">Flyers, posters, social posts and YouTube thumbnails for {membership.organization.name}.</p>
      </div>
      <StudioNav />
      {children}
    </div>
  );
}
