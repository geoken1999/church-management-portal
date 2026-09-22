"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown, BookOpen, X } from "lucide-react";
import { DOC_CATEGORIES, type DocArticle } from "@/lib/docs/content";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function matches(article: DocArticle, query: string): boolean {
  const haystack = `${article.title} ${article.body.join(" ")}`.toLowerCase();
  return haystack.includes(query);
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/20 text-inherit">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function ArticleRow({ article, query, defaultOpen }: { article: DocArticle; query: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="font-medium">{highlight(article.title, query)}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 pb-4 text-sm text-muted-foreground">
          {article.body.map((paragraph, i) => (
            <p key={i} className={paragraph.startsWith("- ") ? "pl-4" : undefined}>
              {highlight(paragraph.startsWith("- ") ? paragraph.slice(2) : paragraph, query)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentationBrowser() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalizedQuery) return DOC_CATEGORIES;
    return DOC_CATEGORIES.map((category) => ({
      ...category,
      articles: category.articles.filter((article) => matches(article, normalizedQuery)),
    })).filter((category) => category.articles.length > 0);
  }, [normalizedQuery]);

  const totalResults = results.reduce((sum, c) => sum + c.articles.length, 0);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 text-center shadow-sm sm:p-12">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-56 bg-[radial-gradient(ellipse_60%_60%_at_50%_-20%,var(--color-accent),transparent)]"
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent">
            <BookOpen className="size-6 text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-2xl font-bold tracking-tight">How can we help?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search how-to guides across every part of KingdomFlow, or browse by category below.
            </p>
          </div>
          <div className="relative w-full">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documentation..."
              className="h-12 rounded-xl pl-11 text-base shadow-sm"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {normalizedQuery && (
        <p className="text-sm text-muted-foreground">
          {totalResults} {totalResults === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
        </p>
      )}

      {results.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No articles match &ldquo;{query}&rdquo;. Try a different search, or raise a ticket from the Support tab.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {results.map((category) => (
            <Card key={category.id}>
              <CardContent>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-heading text-base font-bold">{category.title}</h3>
                  <Badge variant="secondary">{category.articles.length}</Badge>
                </div>
                <div>
                  {category.articles.map((article) => (
                    <ArticleRow key={article.id} article={article} query={normalizedQuery} defaultOpen={Boolean(normalizedQuery)} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
