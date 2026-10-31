import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, PlaySquare, Search, Sparkles } from "lucide-react";
import { getPlanLimits } from "@/lib/plans/dal";
import { getDesigns } from "@/lib/designer/dal";
import { requireStudio } from "@/lib/designer/guard";
import { getCategories, listTemplates } from "@/lib/designer/templates-dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { DesignView } from "@/components/designer/DesignView";
import { TemplateCard } from "@/components/designer/TemplateCard";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Design Studio | KingdomFlow" };

const THUMB = 180;

export default async function StudioHomePage() {
  const { membership, user, allowed } = await requireStudio();
  if (!allowed) return <AccessRestricted label="Design Studio" />;
  const orgId = membership.organization.id;
  const canWrite = membership.tabAccess.designer.write;

  const [designs, categories, plan, popular, recommended] = await Promise.all([
    getDesigns(orgId),
    getCategories(),
    getPlanLimits(orgId),
    listTemplates(orgId, user.id, { sort: "popular" }),
    listTemplates(orgId, user.id, { sort: "recommended" }),
  ]);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const groups = [...new Set(categories.map((c) => c.group_name))];
  const canUsePremium = plan.id !== "basic";
  // Don't show the same templates twice on one page.
  const popularItems = popular.items.slice(0, 4);
  const shown = new Set(popularItems.map((t) => t.id));
  const recommendedItems = recommended.items.filter((t) => !shown.has(t.id)).slice(0, 4);

  const section = (title: string, items: typeof popularItems, more: string) =>
    items.length > 0 && (
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-heading text-xl font-semibold">{title}</h2>
          <Link href={more} className="text-sm text-primary hover:underline">
            See all
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((t) => (
            <TemplateCard key={t.id} template={t} categoryName={names.get(t.category_id) ?? ""} organizationId={orgId} canWrite={canWrite} canUsePremium={canUsePremium} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="space-y-8">
      <form action="/dashboard/studio/templates" method="get" role="search" className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          maxLength={60}
          aria-label="Search templates"
          placeholder="Search church flyers, worship backgrounds, social media posts, event posters…"
          className="h-12 w-full rounded-xl border bg-background pl-10 pr-24 text-sm shadow-sm"
        />
        <Button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2">
          Search
        </Button>
      </form>

      {canWrite && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { href: "/dashboard/studio/designs?new=1", icon: FilePlus2, title: "Blank canvas", note: "Start from scratch at any size" },
            { href: "/dashboard/studio/designs?ai=1", icon: Sparkles, title: "Create with AI", note: "Describe it and get an editable design" },
            { href: "/dashboard/studio/designs?thumb=1", icon: PlaySquare, title: "YouTube thumbnail", note: "1280 × 720, ready to edit" },
          ].map((a) => (
            <Link key={a.title} href={a.href} className="flex items-center gap-3 rounded-xl border p-4 transition hover:bg-muted">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <a.icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-medium">{a.title}</span>
                <span className="block text-xs text-muted-foreground">{a.note}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-heading text-xl font-semibold">Recently edited</h2>
          {designs.length > 0 && (
            <Link href="/dashboard/studio/designs" className="text-sm text-primary hover:underline">
              All designs
            </Link>
          )}
        </div>
        {designs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing yet. Pick a template below to make your first design.</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {designs.slice(0, 6).map((d) => (
              <Link key={d.id} href={`/dashboard/studio/${d.id}`} className="w-[200px] shrink-0 space-y-1.5">
                <div className="flex h-[200px] items-center justify-center rounded-lg bg-muted/50 p-2">
                  <div className="shadow-md">
                    <DesignView doc={d.doc} scale={Math.min(THUMB / d.width, THUMB / d.height)} />
                  </div>
                </div>
                <p className="truncate text-sm font-medium">{d.name}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {categories.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">Browse by category</h2>
          {groups.map((g) => (
            <div key={g} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
              <div className="flex flex-wrap gap-1.5">
                {categories
                  .filter((c) => c.group_name === g)
                  .map((c) => (
                    <Link key={c.id} href={`/dashboard/studio/templates?category=${c.slug}`} className="rounded-full border px-3 py-1 text-sm transition hover:bg-muted">
                      {c.name}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {section("Popular templates", popularItems, "/dashboard/studio/templates?sort=popular")}
      {section("Recommended for you", recommendedItems, "/dashboard/studio/templates")}
      {categories.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">The template library hasn&apos;t been set up yet. Please check back soon.</p>}
    </div>
  );
}
