import type { Metadata } from "next";
import { FileText, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatBytes } from "@/lib/plans/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function getSharedCategory(token: string) {
  const supabase = await createClient();
  const [{ data: category }, { data: documents }] = await Promise.all([
    supabase.rpc("get_shared_category", { token }).maybeSingle(),
    supabase.rpc("get_shared_category_documents", { token }),
  ]);
  return { category, documents: documents ?? [] };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const { category } = await getSharedCategory(token);
  return { title: category ? `${category.name} | KingdomFlow` : "Shared folder | KingdomFlow" };
}

export default async function SharedFolderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { category, documents } = await getSharedCategory(token);

  if (!category) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <Card size="lg">
          <CardHeader>
            <CardTitle className="text-xl">Link not found</CardTitle>
            <CardDescription>This share link is invalid or has been disabled. Ask for a new link.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div>
        <PublicBrandHeader logoUrl={category.organization_logo_url} name={category.organization_name} />
        <div className="text-center">
          <h2 className="font-heading text-xl font-bold">{category.name}</h2>
          <p className="text-sm text-muted-foreground">Documents shared with you.</p>
        </div>
      </div>

      {documents.length === 0 ? (
        <Card size="lg">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Nothing has been shared here yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((document) => (
            <Card key={document.id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                    <FileText className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-heading text-base font-bold">{document.title}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(document.created_at)}</span>
                      <span>{formatBytes(document.file_size)}</span>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<a href={`/share/folder/${token}/file/${document.id}`} target="_blank" rel="noreferrer" />}
                >
                  <Download className="size-3.5" />
                  Download
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PublicPoweredByFooter />
    </div>
  );
}
