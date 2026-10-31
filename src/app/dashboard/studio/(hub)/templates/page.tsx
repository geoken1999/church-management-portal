import type { Metadata } from "next";
import Link from "next/link";
import { getPlanLimits } from "@/lib/plans/dal";
import { requireStudio } from "@/lib/designer/guard";
import { TEMPLATE_PAGE_SIZE, getCategories, getTemplateSizes, listTemplates, type TemplateSort } from "@/lib/designer/templates-dal";
import { AccessRestricted } from "@/components/dashboard/AccessRestricted";
import { TemplateCard } from "@/components/designer/TemplateCard";
import { TemplateFilters, templateHref, type TemplateQuery } from "@/components/designer/TemplateFilters";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Templates | KingdomFlow" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<TemplateQuery & { page?: string }> }) {
  const { membership, user, allowed } = await requireStudio();
  if (!allowed) return <AccessRestricted label="Design Studio" />;
  const params = await searchParams;
  const orgId = membership.organization.id;
  const sort: TemplateSort = params.sort === "popular" || params.sort === "newest" ? params.sort : "recommended";
  const query: TemplateQuery = { q: params.q, category: params.category, size: params.size, price: params.price, sort: params.sort, fav: params.fav };

  const [categories, sizes, plan, result] = await Promise.all([
    getCategories(),
    getTemplateSizes(),
    getPlanLimits(orgId),
    listTemplates(orgId, user.id, {
      q: params.q,
      category: params.category,
      size: params.size,
      price: params.price === "free" || params.price === "premium" ? params.price : undefined,
      sort,
      favoritesOnly: !!params.fav,
      page: Number(params.page) || 1,
    }),
  ]);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const pages = Math.max(1, Math.ceil(result.total / TEMPLATE_PAGE_SIZE));

  return (
    <div className="space-y-5">
      <TemplateFilters query={query} categories={categories} sizes={sizes} />
      {categories.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">The template library hasn&apos;t been set up yet. Please check back soon.</p>
      ) : result.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {params.fav ? "You haven't saved any favourites that match. Tap the heart on a template to keep it here." : "No templates match your search. Try different words or clear the filters."}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {result.total} template{result.total === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.items.map((t) => (
              <TemplateCard key={t.id} template={t} categoryName={names.get(t.category_id) ?? ""} organizationId={orgId} canWrite={membership.tabAccess.designer.write} canUsePremium={plan.id !== "basic"} />
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {result.page > 1 && (
                <Link href={templateHref({ ...query, page: result.page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Previous
                </Link>
              )}
              <span className="text-sm text-muted-foreground">
                Page {result.page} of {pages}
              </span>
              {result.page < pages && (
                <Link href={templateHref({ ...query, page: result.page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
