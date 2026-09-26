"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import {
  uploadRegistrationPassBackground,
  removeRegistrationPassBackground,
  type PassBackgroundState,
} from "@/lib/events/registration-actions";
import {
  MAX_PASS_BACKGROUND_BYTES,
  ALLOWED_PASS_BACKGROUND_TYPES,
  PASS_BACKGROUND_WIDTH,
  PASS_BACKGROUND_HEIGHT,
} from "@/lib/events/registration-validation";
import { FieldError } from "@/components/auth/FieldError";

const initialState: PassBackgroundState = {};
const MAX_MB = Math.round(MAX_PASS_BACKGROUND_BYTES / (1024 * 1024));

// A quick client-side check before spending a round trip on it — the
// server re-checks this from the actual file bytes regardless (a browser
// can't be trusted to have run this at all), so this is purely to give a
// faster, friendlier error than waiting on the Server Action.
async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

export function EventPassBackgroundUpload({
  eventId,
  backgroundUrl,
  passColor,
  onChange,
}: {
  eventId: string;
  backgroundUrl: string | null;
  passColor: string;
  // Lets a parent (the pass preview) reflect a just-picked image immediately,
  // without waiting on a router.refresh() the upload itself doesn't trigger.
  onChange?: (url: string | null) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(uploadRegistrationPassBackground, initialState);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | undefined>();
  const [removePending, startRemoveTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displaySrc = preview ?? backgroundUrl;
  const error = clientError ?? state.error;
  const busy = pending || removePending;

  function handleRemove() {
    setPreview(null);
    onChange?.(null);
    const formData = new FormData();
    formData.set("eventId", eventId);
    startRemoveTransition(async () => {
      await removeRegistrationPassBackground(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium leading-none">Pass background image (optional)</span>
      <p className="text-xs text-muted-foreground">
        Must be exactly {PASS_BACKGROUND_WIDTH}x{PASS_BACKGROUND_HEIGHT}px, up to {MAX_MB}MB.
      </p>
      <form ref={formRef} action={formAction} className="relative">
        <input type="hidden" name="eventId" value={eventId} />
        <input
          ref={inputRef}
          type="file"
          name="background"
          accept={ALLOWED_PASS_BACKGROUND_TYPES.join(",")}
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            const input = e.target;
            if (!file) return;

            if (!ALLOWED_PASS_BACKGROUND_TYPES.includes(file.type)) {
              setClientError("Background must be a PNG, JPEG, or WebP image.");
              input.value = "";
              return;
            }
            if (file.size > MAX_PASS_BACKGROUND_BYTES) {
              setClientError(`Background must be smaller than ${MAX_MB}MB.`);
              input.value = "";
              return;
            }

            const dimensions = await readImageDimensions(file);
            if (!dimensions || dimensions.width !== PASS_BACKGROUND_WIDTH || dimensions.height !== PASS_BACKGROUND_HEIGHT) {
              setClientError(
                dimensions
                  ? `That image is ${dimensions.width}x${dimensions.height}px — it must be exactly ${PASS_BACKGROUND_WIDTH}x${PASS_BACKGROUND_HEIGHT}px.`
                  : "Couldn't read that image's dimensions. Please try a different file.",
              );
              input.value = "";
              return;
            }

            setClientError(undefined);
            const objectUrl = URL.createObjectURL(file);
            setPreview(objectUrl);
            onChange?.(objectUrl);
            formRef.current?.requestSubmit();
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="group relative block h-28 w-full overflow-hidden rounded-md border border-dashed border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={displaySrc ? "Change pass background image" : "Upload a pass background image"}
        >
          {displaySrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- previewing an arbitrary uploaded/remote image, not a static app asset
            <img src={displaySrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${passColor}, transparent)` }}>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <ImagePlus className="size-4" />
                Upload a banner image
              </span>
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
            {busy ? "Uploading..." : "Change image"}
          </span>
        </button>
      </form>
      {displaySrc && (
        <button type="button" onClick={handleRemove} disabled={busy} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
          <X className="size-3" />
          Remove image
        </button>
      )}
      <FieldError id="pass-background-error" message={error} />
    </div>
  );
}
