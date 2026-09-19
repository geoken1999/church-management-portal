"use client";

import { useActionState, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { updateOrganizationLogo, type UpdateLogoState } from "@/lib/organizations/actions";
import { MAX_LOGO_BYTES, ALLOWED_LOGO_TYPES } from "@/lib/organizations/validation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FieldError } from "@/components/auth/FieldError";

const initialState: UpdateLogoState = {};
const DEFAULT_LOGO = "/default_church_logo.png";
const MAX_LOGO_MB = Math.round(MAX_LOGO_BYTES / (1024 * 1024));

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
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          // Validate before submitting — a file over the Server Action body
          // limit would otherwise fail before our own server-side check
          // (and its friendly message) ever runs.
          if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
            setClientError("Logo must be a PNG, JPEG, WebP, or SVG image.");
            e.target.value = "";
            return;
          }
          if (file.size > MAX_LOGO_BYTES) {
            setClientError(`Logo must be smaller than ${MAX_LOGO_MB}MB.`);
            e.target.value = "";
            return;
          }

          setClientError(undefined);
          setPreview(URL.createObjectURL(file));
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
