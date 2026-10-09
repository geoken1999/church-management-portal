"use client";

import { useActionState, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { updateOrganizationLogo, type UpdateLogoState } from "@/lib/organizations/actions";
import { MAX_LOGO_BYTES, ALLOWED_LOGO_TYPES, MAX_LOGO_DIMENSION_PX } from "@/lib/organizations/validation";
import { LogoCropDialog } from "@/components/organizations/LogoCropDialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FieldError } from "@/components/auth/FieldError";

const initialState: UpdateLogoState = {};
const DEFAULT_LOGO = "/default_church_logo.png";
const MAX_LOGO_MB = Math.round(MAX_LOGO_BYTES / (1024 * 1024));
// The avatar never shows this larger than size-10 (40px), so 512px is
// generous headroom for retina displays. Anything bigger than this goes
// through LogoCropDialog rather than being silently auto-resized — the
// admin picks what part of a larger image to keep, instead of an
// arbitrary center-crop/whole-image squeeze deciding it for them.
const LOGO_TARGET_PX = 512;

// Thrown with one of these codes so the caller can show a specific
// message — "that image couldn't be processed" would be misleading for an
// image that decoded fine but is simply the wrong size.
type LogoSizeErrorCode = "too-small" | "too-large";
class LogoSizeError extends Error {
  constructor(public code: LogoSizeErrorCode) {
    super(code);
  }
}

// createImageBitmap (rather than new Image() + reading naturalWidth, which
// forces the decode onto the main thread in some browsers) decodes off the
// main thread, so even a pathological input degrades to "this takes a
// moment" instead of freezing the tab — this is why dimensions are
// checked this way rather than via an <img> element.
async function decodeAndCheckSize(file: File): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width > MAX_LOGO_DIMENSION_PX || bitmap.height > MAX_LOGO_DIMENSION_PX) {
    bitmap.close();
    throw new LogoSizeError("too-large");
  }
  // A floor, not just a ceiling — an image smaller than the target would
  // otherwise need upscaling to fill the crop dialog, which looks soft/
  // blurry no matter where the admin positions it.
  if (bitmap.width < LOGO_TARGET_PX || bitmap.height < LOGO_TARGET_PX) {
    bitmap.close();
    throw new LogoSizeError("too-small");
  }
  return bitmap;
}

// Only reachable for an image that's already exactly LOGO_TARGET_PX in
// both dimensions — anything bigger goes through LogoCropDialog instead,
// which does its own encode once the admin confirms a crop.
function encodeBitmapAsPng(bitmap: ImageBitmap): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = LOGO_TARGET_PX;
  canvas.height = LOGO_TARGET_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas isn't supported in this browser"));
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], "logo.png", { type: "image/png" }));
      else reject(new Error("Couldn't encode the image"));
    }, "image/png");
  });
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
  const [cropBitmap, setCropBitmap] = useState<ImageBitmap | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displaySrc = preview ?? logoUrl ?? DEFAULT_LOGO;
  const error = clientError ?? state.error;

  function submitFile(file: File) {
    if (!inputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    setPreview(URL.createObjectURL(file));
    formRef.current?.requestSubmit();
  }

  function closeCropDialog() {
    cropBitmap?.close();
    setCropBitmap(null);
    if (inputRef.current) inputRef.current.value = "";
  }

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
    <>
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

            let bitmap: ImageBitmap;
            try {
              bitmap = await decodeAndCheckSize(file);
            } catch (err) {
              setClientError(
                err instanceof LogoSizeError && err.code === "too-small"
                  ? `Logo must be at least ${LOGO_TARGET_PX}×${LOGO_TARGET_PX} pixels.`
                  : err instanceof LogoSizeError && err.code === "too-large"
                    ? `Logo's pixel dimensions are too large (max ${MAX_LOGO_DIMENSION_PX}×${MAX_LOGO_DIMENSION_PX}).`
                    : "That image couldn't be processed — try a different file.",
              );
              input.value = "";
              return;
            }

            if (bitmap.width > LOGO_TARGET_PX || bitmap.height > LOGO_TARGET_PX) {
              // Bigger than the target in at least one dimension — let the
              // admin choose what to keep, rather than deciding for them.
              setCropBitmap(bitmap);
              return;
            }

            // Already exactly LOGO_TARGET_PX x LOGO_TARGET_PX — no cropping
            // choice to make.
            try {
              submitFile(await encodeBitmapAsPng(bitmap));
            } catch {
              setClientError("That image couldn't be processed — try a different file.");
              input.value = "";
            } finally {
              bitmap.close();
            }
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

      <LogoCropDialog
        bitmap={cropBitmap}
        onCancel={closeCropDialog}
        onConfirm={(file) => {
          cropBitmap?.close();
          setCropBitmap(null);
          submitFile(file);
        }}
      />
    </>
  );
}
