"use client";

import { useEffect, useMemo, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { MAX_SUPPORT_IMAGES, supportImagesProblem, type SupportAttachment } from "@/lib/support/images";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Picks screenshots to attach: a button, plus pasting straight from the clipboard (a copied
// screenshot can be pasted into the message box). Holds the files; the form adds them on send.
export function SupportImagePicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function add(added: File[]) {
    if (added.length === 0) return;
    const next = [...files, ...added];
    const problem = supportImagesProblem(next);
    if (problem) {
      toast.error(problem);
      return;
    }
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || files.length >= MAX_SUPPORT_IMAGES} onClick={() => input.current?.click()}>
          <ImagePlus className="size-3.5" />
          Add screenshot
        </Button>
        <span className="text-xs text-muted-foreground">Up to {MAX_SUPPORT_IMAGES} images, 5 MB each. You can also paste one into the message.</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[i]} alt={file.name} className="size-16 rounded-md border border-border object-cover" />
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => onChange(files.filter((_, n) => n !== i))}
                className="absolute -top-1.5 -right-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Lets a message box accept a screenshot pasted from the clipboard.
export function imagesFromPaste(event: React.ClipboardEvent): File[] {
  return Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
}

// The screenshots on a ticket or reply: small pictures that open full size in a new tab.
export function SupportAttachments({ items }: { items: SupportAttachment[] | null | undefined }) {
  const shown = (items ?? []).filter((a) => a.url);
  if (shown.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {shown.map((a) => (
        <li key={a.path}>
          <a href={a.url} target="_blank" rel="noreferrer" title={a.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.name} className="max-h-32 max-w-48 rounded-md border border-border object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}
