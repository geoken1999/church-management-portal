// The Templates page's filters as web-address parameters. In a plain module (not a client component) so the server
// page and the filter bar can both use it.

export interface TemplateQuery {
  q?: string;
  category?: string;
  size?: string;
  price?: string;
  sort?: string;
  fav?: string;
}

export function templateHref(query: TemplateQuery & { page?: number }): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value && !(key === "page" && value === 1)) params.set(key, String(value));
  const text = params.toString();
  return `/dashboard/studio/templates${text ? `?${text}` : ""}`;
}
