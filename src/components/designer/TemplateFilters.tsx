"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Search } from "lucide-react";
import type { DesignCategoryRow } from "@/types/database";
import { templateHref, type TemplateQuery } from "@/lib/designer/template-query";
import { Button } from "@/components/ui/button";

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";

export function TemplateFilters({ query, categories, sizes }: { query: TemplateQuery; categories: DesignCategoryRow[]; sizes: { width: number; height: number }[] }) {
  const router = useRouter();
  const [q, setQ] = useState(query.q ?? "");
  const go = (patch: TemplateQuery) => router.push(templateHref({ ...query, ...patch }));
  const groups = [...new Set(categories.map((c) => c.group_name))];

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: q.trim() || undefined });
        }}
        className="relative"
        role="search"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search church flyers, worship backgrounds, social media posts, event posters…"
          aria-label="Search templates"
          maxLength={60}
          className="h-11 w-full rounded-lg border bg-background pl-10 pr-24 text-sm"
        />
        <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2">
          Search
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectClass} value={query.category ?? ""} onChange={(e) => go({ category: e.target.value || undefined })} aria-label="Category">
          <option value="">All categories</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {categories
                .filter((c) => c.group_name === g)
                .map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select className={selectClass} value={query.size ?? ""} onChange={(e) => go({ size: e.target.value || undefined })} aria-label="Dimensions">
          <option value="">Any size</option>
          {sizes.map((s) => (
            <option key={`${s.width}x${s.height}`} value={`${s.width}x${s.height}`}>
              {s.width} × {s.height}
            </option>
          ))}
        </select>
        <select className={selectClass} value={query.price ?? ""} onChange={(e) => go({ price: e.target.value || undefined })} aria-label="Free or premium">
          <option value="">Free and premium</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
        </select>
        <select className={selectClass} value={query.sort ?? "recommended"} onChange={(e) => go({ sort: e.target.value === "recommended" ? undefined : e.target.value })} aria-label="Sort by">
          <option value="recommended">Recommended</option>
          <option value="popular">Most popular</option>
          <option value="newest">Newest</option>
        </select>
        <Button variant={query.fav ? "default" : "outline"} size="sm" onClick={() => go({ fav: query.fav ? undefined : "1" })} aria-pressed={!!query.fav}>
          <Heart className="size-4" /> Favourites
        </Button>
        {(query.q || query.category || query.size || query.price || query.fav || query.sort) && (
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/studio/templates")}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
