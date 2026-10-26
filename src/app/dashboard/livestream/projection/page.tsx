import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/organizations/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { listTranslations } from "@/lib/projection/bible";
import { ensureScreen } from "@/lib/projection/service";
import { cleanTheme } from "@/lib/projection/theme";
import { presentationSlides } from "@/lib/projection/slides";
import { getSiteUrl } from "@/lib/site-url";
import { ProjectionConsole, type ConsoleItem } from "@/components/projection/ProjectionConsole";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { Button } from "@/components/ui/button";
import type { ProjectionItem } from "@/types/database";

export const metadata: Metadata = { title: "Verse projection | KingdomFlow" };
export const dynamic = "force-dynamic";

// Bible verses, song words and announcements, put on a screen or over the live stream video.
export default async function ProjectionPage() {
  const membership = await requireOrganization();
  const access = membership.tabAccess.livestream;
  if (!access.read) return <AccessRestricted label="Live stream" />;
  const organizationId = membership.organization.id;

  const [screen, translations, { data: items }, { data: custom }] = await Promise.all([
    ensureScreen(organizationId),
    listTranslations(organizationId),
    createAdminClient().from("projection_items").select("*").eq("organization_id", organizationId).order("title"),
    createAdminClient().from("bible_translations").select("id").eq("organization_id", organizationId),
  ]);
  const customIds = new Set((custom ?? []).map((c) => c.id));
  // A presentation's slides are stored pictures; the console gets them as ready-to-show slides.
  const slideStore = createAdminClient().storage.from("projection-slides");
  const consoleItems: ConsoleItem[] = ((items ?? []) as ProjectionItem[]).map((item) =>
    item.kind === "presentation"
      ? {
          ...item,
          imageSlides: presentationSlides(
            item.title,
            (item.slide_images ?? []).map((s) => ({ url: slideStore.getPublicUrl(s.path).data.publicUrl, text: s.text })),
          ),
        }
      : item,
  );

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" nativeButton={false} render={<Link href="/dashboard/livestream" />}>
          <ArrowLeft className="size-4" />
          Live stream
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Verse projection</h1>
        <p className="mt-1 text-muted-foreground">Show Bible verses, song words and announcements on the screen in your hall, over the video in OBS, and to members watching in the app.</p>
      </div>
      <ProjectionConsole
        organizationId={organizationId}
        token={screen.token}
        siteUrl={getSiteUrl()}
        initial={{ visible: screen.visible, mode: screen.mode, slide: screen.slide, theme: cleanTheme(screen.theme) }}
        items={consoleItems}
        translations={translations.map((t) => ({ key: t.key, name: t.name, customId: t.key.startsWith("custom:") && customIds.has(t.key.slice(7)) ? t.key.slice(7) : undefined }))}
        canWrite={access.write}
      />
    </div>
  );
}
