"use client";

import { FileText, Download } from "lucide-react";
import { formatBytes } from "@/lib/plans/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PublicBrandHeader, PublicPoweredByFooter } from "@/components/PublicBrandHeader";
import { PublicLocaleProvider } from "@/lib/i18n/PublicLocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleContext";

export interface PublicSharedCategory {
  id: string;
  name: string;
  organization_name: string;
  organization_logo_url: string | null;
}

export interface PublicSharedDocument {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function NotFoundCard() {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <Card size="lg">
        <CardHeader>
          <CardTitle className="text-xl">{t.common.linkNotFound}</CardTitle>
          <CardDescription>{t.publicFolder.notFoundDescription}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function FolderContent({
  token,
  category,
  documents,
}: {
  token: string;
  category: PublicSharedCategory;
  documents: PublicSharedDocument[];
}) {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <div>
        <div className="mb-2 flex justify-end">
          <LanguageSwitcher />
        </div>
        <PublicBrandHeader logoUrl={category.organization_logo_url} name={category.organization_name} />
        <div className="text-center">
          <h2 className="font-heading text-xl font-bold">{category.name}</h2>
          <p className="text-sm text-muted-foreground">{t.publicFolder.tagline}</p>
        </div>
      </div>

      {documents.length === 0 ? (
        <Card size="lg">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t.publicFolder.nothingShared}</CardContent>
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
                  {t.common.download}
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

export function PublicFolderPageView({
  token,
  category,
  documents,
}: {
  token: string;
  category: PublicSharedCategory | null;
  documents: PublicSharedDocument[];
}) {
  return (
    <PublicLocaleProvider>
      {category ? <FolderContent token={token} category={category} documents={documents} /> : <NotFoundCard />}
    </PublicLocaleProvider>
  );
}
