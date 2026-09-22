"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Download, FolderOpen, FileText, UserRound, CalendarDays, Lock, Link2, Tag } from "lucide-react";
import {
  uploadSharedDocument,
  deleteSharedDocument,
  getFolderDownloadUrl,
  createFolderCategory,
  deleteFolderCategory,
  setDocumentCategory,
  toggleDocumentShare,
  toggleCategoryShare,
  type UploadDocumentState,
  type CategoryState,
} from "@/lib/folder/actions";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/folder/validation";
import { formatBytes } from "@/lib/plans/format";
import type { SharedDocument, FolderCategory } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type DocumentRow = SharedDocument & {
  profiles: { first_name: string; last_name: string } | null;
  folder_categories: { id: string; name: string } | null;
};

const initialUploadState: UploadDocumentState = {};
const initialCategoryState: CategoryState = {};

function uploaderName(document: DocumentRow): string {
  return document.profiles ? `${document.profiles.first_name} ${document.profiles.last_name}`.trim() : "Someone";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CopyLinkRow({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <Input readOnly value={link} className="h-8 text-xs" onFocus={(event) => event.target.select()} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function CreateCategoryDialog({ organizationId }: { organizationId: string }) {
  const [state, setState] = useState<CategoryState>(initialCategoryState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createFolderCategory(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(initialCategoryState);
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" variant="outline"><Plus className="size-3.5" />Category</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
          <DialogDescription>
            Group documents together and share them all at once with a single link — e.g. &quot;Youth Ministry&quot; or &quot;Board&quot;.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="Youth Ministry" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryChip({ category, siteUrl, canWrite, canDelete }: { category: FolderCategory; siteUrl: string; canWrite: boolean; canDelete: boolean }) {
  const [shareEnabled, setShareEnabled] = useState(category.share_enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const link = `${siteUrl}/share/folder/${category.share_token}`;

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = await toggleCategoryShare(category.id, !shareEnabled);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShareEnabled(result.shareEnabled ?? shareEnabled);
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        render={
          <Badge variant="secondary" className="cursor-pointer gap-1">
            <Tag className="size-3" />
            {category.name}
            {shareEnabled && <Link2 className="size-3" />}
          </Badge>
        }
      />
      <PopoverContent align="start" className="w-80">
        <PopoverTitle>{category.name}</PopoverTitle>
        <PopoverDescription>
          {shareEnabled
            ? "Anyone with this link can view and download every document in this category — no login needed."
            : "Enable this link to share every document in this category at once."}
        </PopoverDescription>
        <div className="mt-3 space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {canWrite && (
            <Button type="button" size="sm" variant={shareEnabled ? "outline" : "default"} onClick={handleToggle} disabled={pending}>
              <Link2 className="size-3.5" />
              {shareEnabled ? "Disable link" : "Enable link"}
            </Button>
          )}
          {shareEnabled && <CopyLinkRow link={link} />}
          {canDelete && (
            <form action={deleteFolderCategory}>
              <input type="hidden" name="categoryId" value={category.id} />
              <Button type="submit" size="sm" variant="ghost">
                <Trash2 className="size-3.5" />
                Delete category
              </Button>
            </form>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CategoriesBar({
  organizationId,
  categories,
  siteUrl,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  categories: FolderCategory[];
  siteUrl: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  if (categories.length === 0 && !canWrite) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.map((category) => (
        <CategoryChip key={category.id} category={category} siteUrl={siteUrl} canWrite={canWrite} canDelete={canDelete} />
      ))}
      {canWrite && <CreateCategoryDialog organizationId={organizationId} />}
    </div>
  );
}

function UploadDocumentDialog({ organizationId, categories }: { organizationId: string; categories: FolderCategory[] }) {
  const [state, setState] = useState<UploadDocumentState>(initialUploadState);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("none");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await uploadSharedDocument(state, formData);
      setState(result);
      if (result.success) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setState(initialUploadState);
          setCategoryId("none");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button">
            <Plus className="size-4" />
            Upload document
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            Only people you&apos;ve given access to this tab (Team → Permissions) will be able to see or download it, unless you share it via a link.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="categoryId" value={categoryId} />
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Board meeting minutes — March" required />
          </div>
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "none")}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder="No category">
                    {categories.find((category) => category.id === categoryId)?.name ?? "No category"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <Input id="file" name="file" type="file" accept={ALLOWED_DOCUMENT_TYPES.join(",")} required />
            <p className="text-xs text-muted-foreground">
              PDF, Word, Excel, PowerPoint, images, text, or zip — up to {Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShareDocumentPopover({ document, siteUrl }: { document: DocumentRow; siteUrl: string }) {
  const [shareEnabled, setShareEnabled] = useState(document.share_enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const link = `${siteUrl}/share/file/${document.share_token}`;

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const result = await toggleDocumentShare(document.id, !shareEnabled);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShareEnabled(result.shareEnabled ?? shareEnabled);
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            <Link2 className="size-3.5" />
            Share
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80">
        <PopoverTitle>Share this document</PopoverTitle>
        <PopoverDescription>
          {shareEnabled
            ? "Anyone with this link can view and download this file — no login needed."
            : "Enable a link so anyone who has it can view and download this file without logging in."}
        </PopoverDescription>
        <div className="mt-3 space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="button" size="sm" variant={shareEnabled ? "outline" : "default"} onClick={handleToggle} disabled={pending}>
            <Link2 className="size-3.5" />
            {shareEnabled ? "Disable link" : "Enable link"}
          </Button>
          {shareEnabled && <CopyLinkRow link={link} />}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CategoryPicker({ document, categories }: { document: DocumentRow; categories: FolderCategory[] }) {
  const [categoryId, setCategoryId] = useState(document.category_id ?? "none");
  const [, startTransition] = useTransition();

  return (
    <Select
      value={categoryId}
      onValueChange={(value) => {
        const next = value ?? "none";
        setCategoryId(next);
        startTransition(() => {
          setDocumentCategory(document.id, next === "none" ? null : next);
        });
      }}
    >
      <SelectTrigger size="sm" className="h-6 w-auto gap-1 border-none bg-transparent px-0 text-xs text-muted-foreground shadow-none hover:bg-muted">
        <SelectValue placeholder="No category">
          {categories.find((category) => category.id === categoryId)?.name ?? "No category"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No category</SelectItem>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DocumentCard({
  document,
  categories,
  siteUrl,
  canWrite,
  canDelete,
}: {
  document: DocumentRow;
  categories: FolderCategory[];
  siteUrl: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setDownloading(true);
    const result = await getFolderDownloadUrl(document.id);
    setDownloading(false);
    if (result.error || !result.url) {
      setError(result.error ?? "Couldn't generate a download link.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
              <FileText className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold">{document.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <UserRound className="size-3.5" />
                  {uploaderName(document)}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3.5" />
                  {formatDate(document.created_at)}
                </span>
                <span>{formatBytes(document.file_size)}</span>
                {document.share_enabled && (
                  <span className="flex items-center gap-1 text-primary">
                    <Link2 className="size-3.5" />
                    Shared
                  </span>
                )}
              </div>
              <div className="mt-1">
                {canWrite && categories.length > 0 ? (
                  <CategoryPicker document={document} categories={categories} />
                ) : document.folder_categories ? (
                  <Badge variant="secondary" className="gap-1">
                    <Tag className="size-3" />
                    {document.folder_categories.name}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={handleDownload} disabled={downloading}>
              <Download className="size-3.5" />
              {downloading ? "Preparing..." : "Download"}
            </Button>
            {canWrite && <ShareDocumentPopover document={document} siteUrl={siteUrl} />}
            {canDelete && (
              <form action={deleteSharedDocument}>
                <input type="hidden" name="documentId" value={document.id} />
                <input type="hidden" name="path" value={document.file_path} />
                <Button type="submit" variant="ghost" size="sm">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </form>
            )}
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function FolderManager({
  organizationId,
  documents,
  categories,
  siteUrl,
  canWrite,
  canDelete,
}: {
  organizationId: string;
  documents: DocumentRow[];
  categories: FolderCategory[];
  siteUrl: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Private by default — share a link to give access without a login.
        </p>
        {canWrite && <UploadDocumentDialog organizationId={organizationId} categories={categories} />}
      </div>

      <CategoriesBar organizationId={organizationId} categories={categories} siteUrl={siteUrl} canWrite={canWrite} canDelete={canDelete} />

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FolderOpen className="size-8 text-muted-foreground" />
            <div>
              <h3 className="font-heading text-base font-bold">No documents yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {canWrite ? 'Click "Upload document" to add your first one.' : "Check back once something is shared."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} categories={categories} siteUrl={siteUrl} canWrite={canWrite} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
