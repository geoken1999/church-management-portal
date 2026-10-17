import Link from "next/link";
import { Button } from "@/components/ui/button";

// Previous / next links that keep the current filters.
export function Pager({
  basePath,
  params,
  page,
  pageCount,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
    search.set("page", String(p));
    return `${basePath}?${search}`;
  };
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {pageCount}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          nativeButton={false}
          render={<Link href={href(page - 1)}>Previous</Link>}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          nativeButton={false}
          render={<Link href={href(page + 1)}>Next</Link>}
        />
      </div>
    </div>
  );
}
