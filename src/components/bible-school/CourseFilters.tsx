"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

// Search and status filter for the courses list; the filtering itself happens on the server.
export function CourseFilters({ q, status }: { q: string; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [term, setTerm] = useState(q);
  const [state, setState] = useState(status);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (term.trim()) params.set("q", term.trim());
    if (state) params.set("status", state);
    router.push(`${pathname}${params.size ? `?${params}` : ""}`);
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
      <Input
        className="max-w-xs"
        placeholder="Search by title or code"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <select
        value={state}
        onChange={(e) => setState(e.target.value)}
        className={SELECT_CLASS}
        aria-label="Status"
      >
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      <Button type="submit" variant="outline" size="sm">
        Filter
      </Button>
    </form>
  );
}
