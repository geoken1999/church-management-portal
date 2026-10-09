"use client";

import { useActionState, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { updateOrganizationLogo, type UpdateLogoState } from "@/lib/organizations/actions";
import { MAX_LOGO_BYTES, ALLOWED_LOGO_TYPES, MAX_LOGO_DIMENSION_PX } from "@/lib/organizations/validation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FieldError } from "@/components/auth/FieldError";

const initialState: UpdateLogoState = {};
const DEFAULT_LOGO = "/default_church_logo.png";
const MAX_LOGO_MB = Math.round(MAX_LOGO_BYTES / (1024 * 1024));
// The avatar never shows this larger than size-10 (40px), so 512px is
// generous headroom for retina displays while keeping the re-encoded file
// tiny regardless of what was uploaded.
const LOGO_TARGET_PX = 512;

// Re-encodes whatever the admin picked into a small, fixed-size PNG before
// it's ever shown or uploaded. createImageBitmap (rather than new Image() +
// reading naturalWidth, which forces the decode onto the main thread in
// some browsers) decodes off the main thread, so even a pathological input
// degrades to "the button stays disabled for a bit" instead of freezing the
// tab — this is the actual fix for that; the byte-size check above was
// never enough on its own, since a photo can be high-resolution (slow/
// memory-heavy to decode and paint) while still being well under
// MAX_LOGO_BYTES.
async function resizeLogoForUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > MAX_LOGO_DIMENSION_PX || bitmap.height > MAX_LOGO_DIMENSION_PX) {
      throw new Error("Image dimensions too large");
    }

    const scale = Math.min(1, LOGO_TARGET_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas isn't supported in this browser");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Couldn't encode the resized image");
    return new File([blob], "logo.png", { type: "image/png" });
  } finally {
    bitmap.close();
  }
}

export function ChurchLogoUpload({
  organizationId,
  logoUrl,
  canManage,
}: {
  organizationId: string;
  logoUrl: string | null;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateOrganizationLogo, initialState);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displaySrc = preview ?? logoUrl ?? DEFAULT_LOGO;
  const error = clientError ?? state.error;

  const avatar = (
    <Avatar size="lg" className="rounded-lg">
      <AvatarImage src={displaySrc} alt="Church logo" />
      <AvatarFallback className="rounded-lg" />
    </Avatar>
  );

  if (!canManage) {
    return avatar;
  }

  return (
    <form ref={formRef} action={formAction} className="relative">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input
        ref={inputRef}
        type="file"
        name="logo"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const input = e.target;
          const file = input.files?.[0];
          if (!file) return;

          // Validate before submitting — a file over the Server Action body
          // limit would otherwise fail before our own server-side check
          // (and its friendly message) ever runs.
          if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
            setClientError("Logo must be a PNG, JPEG, or WebP image.");
            input.value = "";
            return;
          }
          if (file.size > MAX_LOGO_BYTES) {
            setClientError(`Logo must be smaller than ${MAX_LOGO_MB}MB.`);
            input.value = "";
            return;
          }

          setClientError(undefined);

          let resized: File;
          try {
            resized = await resizeLogoForUpload(file);
          } catch {
            setClientError("That image couldn't be processed — try a different file or a smaller image.");
            input.value = "";
            return;
          }

          // Swap the resized file into the input before submitting — it
          // still holds the original (possibly huge) file the admin picked.
          const transfer = new DataTransfer();
          transfer.items.add(resized);
          input.files = transfer.files;

          setPreview(URL.createObjectURL(resized));
          formRef.current?.requestSubmit();
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="group relative rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label="Change church logo"
        title="Change church logo"
      >
        {avatar}
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <Pencil className="size-4 text-white" />
        </span>
      </button>
      {error && (
        <div className="absolute z-10 mt-1 w-max max-w-56">
          <FieldError id="logo-error" message={error} />
        </div>
      )}
    </form>
  );
}
